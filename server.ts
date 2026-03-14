import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { LocalEvomap, DEFAULT_CONFIG } from './index';
import type { Gene, Capsule, EvolutionEvent } from './core/types/gene-capsule-schema';
import type { EvolutionResult, EvolutionChange } from './core/evolution-engine';
import { ApprovalRequiredError } from './core/evolution-engine';
import type { BlastRadiusEstimate } from './core/validation-gate';
import { shouldReuseCapsule } from './core/capsule-manager';
import { resolveCapsuleGene, resolveCapsuleGenes } from './core/capsule-gene-resolver';
import { InvalidSignalContextError } from './core/signal-extractor';
import { matchPatternToSignals, NoMatchingGeneError, AllGenesBannedError } from './core/gene-selector';
import { normalizeSignals } from './core/types/signal-registry';
import { evaluateAgentCompatibility, loadAgentManifest } from './core/agent-manifest';
import { buildAgentBootstrapChecklist } from './core/agent-bootstrap-manifest';
import { isAgentClient } from './core/types/agent-bootstrap-schema';
import type { AgentCheckRequest, AgentClient } from './core/types/agent-bootstrap-schema';
import { TaskSessionStore } from './core/storage/task-session-store';
import { EvolutionService } from './core/evolution-service';
import { synthesizeGeneAlgorithmic } from './core/skill-distiller';
import { DistillJobStore } from './core/storage/distill-job-store';
import { createProjectPluginManager } from './core/plugins/plugin-manager';
import { MappingProxy, type MappingProxyLike } from './core/plugins/mapping-proxy';
import { handleUnifiedMappingRoute } from './core/plugins/http-mapping';

// 加载 .env 文件（无依赖实现，避免引入 dotenv）
function loadEnvFile(envPath: string): void {
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      // 移除引号
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // 不覆盖已存在的环境变量
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env 文件不存在时静默忽略
  }
}

// 优先加载 ENV_FILE 指定的配置文件（用于 dual 环境）
if (process.env.ENV_FILE) {
  loadEnvFile(process.env.ENV_FILE);
}
loadEnvFile(path.join(__dirname, '..', '.env'));
loadEnvFile(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PROJECT_ROOT = __dirname.endsWith('dist') ? path.resolve(__dirname, '..') : __dirname;

const corsOriginsRaw = process.env.CORS_ORIGINS || '*';
const corsOrigins = corsOriginsRaw.split(',').map((item) => item.trim()).filter(Boolean);

// API Key configuration
const HUB_API_KEY = process.env.HUB_API_KEY || 'test-api-key';

// Dashboard state for backward compatibility
let dashboardState = {
    genes: 0,
    capsules: 0,
    events: 0
};

let dashboardEventLog: Array<{time: string, msg: string}> = [];

// Pending approval store
interface PendingApproval {
    id: string;
    timestamp: string;
    signals: string[];
    geneId: string;
    capsuleId?: string;
    changes: EvolutionChange[];
    blastRadius: BlastRadiusEstimate;
    confidence: number;
    logs: any[];
    status: 'pending' | 'approved' | 'rejected';
    resolvedAt?: string;
    resolvedBy?: string;
}

const pendingApprovals = new Map<string, PendingApproval>();

function logDashboardEvent(msg: string) {
    dashboardState.events++;
    dashboardEventLog.unshift({
        time: new Date().toISOString(),
        msg
    });
    if (dashboardEventLog.length > 50) dashboardEventLog.pop();
}

function resolveCorsOrigin(origin?: string): string {
    if (corsOrigins.includes('*')) return '*';
    if (origin && corsOrigins.includes(origin)) return origin;
    return corsOrigins[0] || 'null';
}

/**
 * API Key authentication middleware
 */
function checkApiKey(req: http.IncomingMessage): boolean {
    const authHeader = req.headers.authorization;
    if (!authHeader) return false;
    
    // Support Bearer token format
    if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        return token === HUB_API_KEY;
    }
    
    // Also support raw API key
    return authHeader === HUB_API_KEY;
}

// Real LocalEvomap instance
let evomap: LocalEvomap | null = null;
let taskStore: TaskSessionStore | null = null;
let evolutionService: EvolutionService | null = null;
let distillJobStore: DistillJobStore | null = null;
let pluginManagerPromise: Promise<any> | null = null;
let defaultMappingProxyPromise: Promise<MappingProxyLike> | null = null;

export interface CreateHttpServerOptions {
    mappingProxy?: MappingProxyLike;
}

async function getEvomap(): Promise<LocalEvomap> {
    if (!evomap) {
        const genesPath = process.env.GENES_PATH || DEFAULT_CONFIG.genes_path;
        const capsulesPath = process.env.CAPSULES_PATH || DEFAULT_CONFIG.capsules_path;
        const eventsPath = process.env.EVENTS_PATH || DEFAULT_CONFIG.events_path;
        
        const reviewMode = process.env.EVOMAP_REVIEW_MODE !== undefined
            ? process.env.EVOMAP_REVIEW_MODE === 'true'
            : DEFAULT_CONFIG.review_mode;
        const autoApproveLowRisk = process.env.AUTO_APPROVE_LOW_RISK === 'true';
        const autoApproveMediumRisk = process.env.AUTO_APPROVE_MEDIUM_RISK === 'true';
        const dryRun = process.env.EVOMAP_DRY_RUN === 'true';
        
        const config = {
            ...DEFAULT_CONFIG,
            genes_path: genesPath,
            capsules_path: capsulesPath,
            events_path: eventsPath,
            review_mode: reviewMode,
            autoApproveLowRisk,
            autoApproveMediumRisk,
            dryRun,
        };
        
        evomap = new LocalEvomap(config);
        await evomap.init();
        
        console.log('[Server] LocalEvomap initialized (algorithmic mode)');
    }
    return evomap;
}

async function getEvolutionService(): Promise<EvolutionService> {
    if (!evolutionService) {
        const currentEvomap = await getEvomap();
        const eventsPath = process.env.EVENTS_PATH || DEFAULT_CONFIG.events_path;
        const tasksPath = process.env.TASKS_PATH || path.join(path.dirname(eventsPath), 'tasks');

        taskStore = new TaskSessionStore(tasksPath);
        await taskStore.init();
        evolutionService = new EvolutionService({ evomap: currentEvomap, taskStore });
    }

    return evolutionService;
}

async function getDistillJobStore(): Promise<DistillJobStore> {
    if (!distillJobStore) {
        const eventsPath = process.env.EVENTS_PATH || DEFAULT_CONFIG.events_path;
        const jobsPath = process.env.DISTILL_JOBS_PATH || path.join(path.dirname(eventsPath), 'distill-jobs');
        distillJobStore = new DistillJobStore(jobsPath);
        await distillJobStore.init();
    }

    return distillJobStore;
}

async function getDefaultPluginManager() {
    if (!pluginManagerPromise) {
        pluginManagerPromise = (async () => {
            const manager = await createProjectPluginManager(PROJECT_ROOT);
            await manager.initialize();
            return manager;
        })();
    }

    return pluginManagerPromise;
}

async function getDefaultMappingProxy(): Promise<MappingProxyLike> {
    if (!defaultMappingProxyPromise) {
        defaultMappingProxyPromise = (async () => {
            const pluginManager = await getDefaultPluginManager();
            return new MappingProxy({ pluginManager });
        })();
    }

    return defaultMappingProxyPromise;
}

async function runAutomaticDistillation(evomap: LocalEvomap): Promise<{ distillJobId: string; distillStatus: string; distilledGeneId?: string | null }> {
    const allCapsules = (await evomap.getAllCapsules())
        .filter(capsule => !capsule._deleted && capsule.outcome.status === 'success')
        .sort((left, right) => (left.metadata?.created_at || '').localeCompare(right.metadata?.created_at || ''));
    const sourceCapsuleIds = allCapsules.slice(-20).map(capsule => capsule.id);
    const fingerprint = 'caps:' + sourceCapsuleIds.join(',');

    const jobStore = await getDistillJobStore();
    const created = await jobStore.createPending({ sourceCapsuleIds, fingerprint });
    const running = created.status === 'running' ? created : await jobStore.markRunning(created.jobId);

    try {
        const allGenes = await evomap.getAllGenes();
        const result = synthesizeGeneAlgorithmic(
            await evomap.getAllCapsules(),
            allGenes
        );

        if (!result.gene) {
            await jobStore.markFailed(running.jobId, 'Algorithmic distillation produced no gene');
            return { distillJobId: running.jobId, distillStatus: 'failed' };
        }

        await evomap.addGene(result.gene);
        await jobStore.markSucceeded(running.jobId, result.gene.id);
        return { distillJobId: running.jobId, distillStatus: 'succeeded', distilledGeneId: result.gene.id };
    } catch (error) {
        await jobStore.markFailed(running.jobId, (error as Error).message);
        return { distillJobId: running.jobId, distillStatus: 'failed' };
    }
}

export function createHttpServer(options: CreateHttpServerOptions = {}): http.Server {
return http.createServer(async (req, res) => {
    // CORS & Headers
    const reqOrigin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', resolveCorsOrigin(reqOrigin));
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // Serve static files
    if (url.pathname === '/' || url.pathname === '/index.html') {
        const filePath = path.join(__dirname, 'index.html');
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
        return;
    }

    // Skill distribution endpoints
    if (url.pathname === '/install.sh' || url.pathname === '/install.ps1' || url.pathname === '/INSTALL.md') {
        const projectRoot = PROJECT_ROOT;
        const fileName = url.pathname.slice(1); // remove leading /
        const filePath = path.join(projectRoot, 'opencode', 'localevomap-skill', fileName);
        const mimeMap: Record<string, string> = {
            '.sh': 'text/x-shellscript; charset=utf-8',
            '.ps1': 'text/plain; charset=utf-8',
            '.md': 'text/markdown; charset=utf-8',
        };
        const ext = path.extname(fileName);
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'text/plain' });
            res.end(data);
        });
        return;
    }

    if (url.pathname.startsWith('/skill/') || url.pathname === '/skill') {
        const projectRoot = PROJECT_ROOT;
        const skillDir = path.join(projectRoot, 'skill');
        
        const clientFileMap: Record<string, string> = {
            'claude': 'SKILL.md',
            'claude-code': 'SKILL.md',
            'cursor': 'SKILL.md',
            'kimi': 'SKILL.md',
            'opencode': 'SKILL.md',
            'codex': 'SKILL.md',
        };
        
        // /skill or /skill/ → return skill.json (manifest)
        const subPath = url.pathname.replace(/^\/skill\/?/, '');
        
        if (!subPath || subPath === '') {
            const filePath = path.join(skillDir, 'skill.json');
            fs.readFile(filePath, (err, data) => {
                if (err) { res.writeHead(404); res.end('Not found'); return; }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(data);
            });
            return;
        }
        
        // /skill/claude, /skill/opencode, /skill/codex → client-specific markdown
        if (clientFileMap[subPath]) {
            const filePath = path.join(skillDir, clientFileMap[subPath]);
            fs.readFile(filePath, (err, data) => {
                if (err) { res.writeHead(404); res.end('Not found'); return; }
                res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
                res.end(data);
            });
            return;
        }
        
        // /skill/<filename> → serve any file in skill dir (with traversal protection)
        const filePath = path.join(skillDir, subPath);
        if (!filePath.startsWith(skillDir)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        
        fs.readFile(filePath, (err, data) => {
            if (err) { res.writeHead(404); res.end('Not found'); return; }
            const ext = path.extname(filePath);
            const mimeTypes: Record<string, string> = {
                '.json': 'application/json',
                '.ts': 'text/plain; charset=utf-8',
                '.js': 'application/javascript',
                '.md': 'text/markdown; charset=utf-8',
                '.sh': 'text/x-shellscript',
            };
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
            res.end(data);
        });
        return;
    }

    // Seed data endpoint
    if (req.method === 'POST' && url.pathname === '/api/v1/seed') {
        await handleSeed(req, res);
        return;
    }

    // Hub API v1 endpoints (check first, before legacy /api/)
    if (url.pathname.startsWith('/api/v1/')) {
        console.log('[Server] Hub API request:', req.method, url.pathname);
        await handleHubApi(req, res, url, options.mappingProxy);
        return;
    }

    // Legacy API Routes (backward compatibility)
    if (url.pathname.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json');

        // Legacy dashboard endpoints
        if (req.method === 'GET' && url.pathname === '/api/stats') {
            res.writeHead(200);
            res.end(JSON.stringify(dashboardState));
            return;
        }

        if (req.method === 'GET' && url.pathname === '/api/events') {
            res.writeHead(200);
            res.end(JSON.stringify(dashboardEventLog));
            return;
        }

        if (req.method === 'POST') {
            switch (url.pathname) {
                case '/api/reset':
                    dashboardState = { genes: 0, capsules: 0, events: 0 };
                    dashboardEventLog = [];
                    res.writeHead(200);
                    res.end(JSON.stringify({ message: 'State reset' }));
                    return;

                case '/api/gene':
                    dashboardState.genes++;
                    logDashboardEvent(`Gene injected: G-${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
                    res.writeHead(200);
                    res.end(JSON.stringify({ message: 'Gene added', state: dashboardState }));
                    return;

                case '/api/capsule':
                    dashboardState.capsules++;
                    logDashboardEvent(`Capsule spawned: CAP-${dashboardState.capsules}`);
                    res.writeHead(200);
                    res.end(JSON.stringify({ message: 'Capsule added', state: dashboardState }));
                    return;

                case '/api/evolve':
                    if (dashboardState.genes === 0 || dashboardState.capsules === 0) {
                        logDashboardEvent('Evolution failed: Missing components');
                        res.writeHead(400);
                        res.end(JSON.stringify({ message: 'Needs both genes and capsules to evolve' }));
                        return;
                    }
                    dashboardState.genes = Math.max(0, dashboardState.genes - 1);
                    dashboardState.capsules = Math.max(0, dashboardState.capsules - 1);
                    logDashboardEvent('Evolution sequence triggered. Mutating DNA...');
                    res.writeHead(200);
                    res.end(JSON.stringify({ message: 'Evolution executed', state: dashboardState }));
                    return;

                default:
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Endpoint not found' }));
                    return;
            }
        }
    }

    // 404
    res.writeHead(404);
    res.end('Not found');
});
}

/**
 * Handle Hub API v1 requests
 */
async function handleHubApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    mappingProxy?: MappingProxyLike
): Promise<void> {
    res.setHeader('Content-Type', 'application/json');
    
    const pathname = url.pathname;

    if (req.method === 'GET' && pathname === '/api/v1/agent-manifest') {
        await handleAgentManifest(req, res);
        return;
    }

    if (req.method === 'GET' && pathname === '/api/v1/agent/bootstrap') {
        await handleAgentBootstrap(req, res, url);
        return;
    }

    if (req.method === 'POST' && pathname === '/api/v1/agent/check') {
        await handleAgentCheck(req, res);
        return;
    }

    if (pathname.startsWith('/api/v1/mapping')) {
        const resolvedMappingProxy = mappingProxy ?? await getDefaultMappingProxy();
        const handled = await handleUnifiedMappingRoute(req, res, url, resolvedMappingProxy);
        if (handled) {
            return;
        }
    }
    
    try {
        const evomap = await getEvomap();
        
        // GET /api/v1/capsules/search
        if (req.method === 'GET' && pathname === '/api/v1/capsules/search') {
            await handleCapsuleSearch(req, res, evomap, url.searchParams);
            return;
        }
        
        // Capsule selection endpoint (must be before generic /capsules/:id block)
        if (req.method === 'POST' && pathname === '/api/v1/capsules/select') {
            await handleSelectCapsule(req, res, evomap);
            return;
        }
        
        // Capsule individual endpoints: GET/:id, GET/:id/download, PUT/:id, DELETE/:id
        if (pathname.startsWith('/api/v1/capsules/')) {
            const parts = pathname.split('/');
            if (parts.length >= 5) {
                const capsuleId = parts[4];
                const isDownload = parts[5] === 'download';
                
                if (isDownload) {
                    await handleCapsuleDownload(req, res, evomap, capsuleId);
                } else if (req.method === 'GET') {
                    await handleCapsuleGet(req, res, evomap, capsuleId);
                } else if (req.method === 'PUT') {
                    await handleCapsuleUpdate(req, res, evomap, capsuleId);
                } else if (req.method === 'DELETE') {
                    await handleCapsuleDelete(req, res, evomap, capsuleId);
                } else {
                    res.writeHead(405);
                    res.end(JSON.stringify({ error: 'Method not allowed' }));
                }
                return;
            }
        }
        
        // Capsule list (no search params, all capsules)
        if (req.method === 'GET' && pathname === '/api/v1/capsules') {
            await handleCapsulesList(req, res, evomap);
            return;
        }
        
        // Gene selection endpoint (must be before generic /genes/:id block)
        if (req.method === 'POST' && pathname === '/api/v1/genes/select') {
            await handleSelectGene(req, res, evomap);
            return;
        }
        
        // Gene endpoints
        if (pathname.startsWith('/api/v1/genes/')) {
            const parts = pathname.split('/');
            const geneId = parts[4];
            
            if (req.method === 'GET') {
                await handleGeneGet(req, res, evomap, geneId);
            } else if (req.method === 'PUT') {
                await handleGeneUpdate(req, res, evomap, geneId);
            } else if (req.method === 'DELETE') {
                await handleGeneDelete(req, res, evomap, geneId);
            } else {
                res.writeHead(405);
                res.end(JSON.stringify({ error: 'Method not allowed' }));
            }
            return;
        }
        
        if (req.method === 'GET' && pathname === '/api/v1/genes') {
            await handleGenesList(req, res, evomap, url.searchParams);
            return;
        }
        
        if (req.method === 'POST' && pathname === '/api/v1/genes') {
            await handleGeneCreate(req, res, evomap);
            return;
        }
        
        if (req.method === 'POST' && pathname === '/api/v1/capsules') {
            await handleCapsuleCreate(req, res, evomap);
            return;
        }
        
        // Events endpoint
        if (req.method === 'GET' && pathname === '/api/v1/events') {
            await handleEventsList(req, res, evomap, url.searchParams);
            return;
        }
        
        if (pathname.startsWith('/api/v1/events/')) {
            const parts = pathname.split('/');
            const eventId = parts[4];
            if (req.method === 'GET') {
                await handleEventGet(req, res, evomap, eventId);
            } else {
                res.writeHead(405);
                res.end(JSON.stringify({ error: 'Method not allowed' }));
            }
            return;
        }
        
        // Evolution endpoint
        if (req.method === 'POST' && pathname === '/api/v1/evolve') {
            await handleEvolve(req, res, evomap);
            return;
        }
        
        // Pending approval endpoints
        if (req.method === 'GET' && pathname === '/api/v1/pending') {
            handlePendingList(req, res);
            return;
        }
        
        if (pathname.startsWith('/api/v1/pending/')) {
            const parts = pathname.split('/');
            const pendingId = parts[4];
            const action = parts[5];
            
            if (req.method === 'GET' && !action) {
                handlePendingGet(req, res, pendingId);
                return;
            }
            if (req.method === 'POST' && action === 'approve') {
                await handlePendingApprove(req, res, evomap, pendingId);
                return;
            }
            if (req.method === 'POST' && action === 'reject') {
                handlePendingReject(req, res, pendingId);
                return;
            }
        }
        
        if (req.method === 'POST' && pathname === '/api/v1/tasks') {
            await handleTaskCreate(req, res);
            return;
        }

        if (pathname.startsWith('/api/v1/tasks/')) {
            const parts = pathname.split('/').filter(Boolean);
            const taskId = decodeURIComponent(parts[3] || '');
            const action = parts[4];

            if (taskId) {
                if (req.method === 'GET' && !action) {
                    await handleTaskGet(req, res, taskId);
                    return;
                }

                if (req.method === 'POST' && action === 'search') {
                    await handleTaskSearch(req, res, taskId);
                    return;
                }

                if (req.method === 'POST' && action === 'usage') {
                    await handleTaskUsage(req, res, taskId);
                    return;
                }

                if (req.method === 'POST' && action === 'finalize') {
                    await handleTaskFinalize(req, res, taskId);
                    return;
                }
            }
        }

        if (req.method === 'POST' && pathname === '/api/v1/knowledge/search') {
            await handleKnowledgeSearch(req, res);
            return;
        }

        if (pathname.startsWith('/api/v1/workspaces/')) {
            const parts = pathname.split('/').filter(Boolean);
            const workspace = decodeURIComponent(parts[3] || '');
            const action = parts[4];

            if (workspace) {
                if (req.method === 'GET' && action === 'playbook') {
                    await handleWorkspacePlaybook(req, res, workspace);
                    return;
                }

                if (req.method === 'GET' && action === 'recent-successes') {
                    await handleWorkspaceRecentSuccesses(req, res, workspace);
                    return;
                }
            }
        }

        // Signal extraction endpoint
        if (req.method === 'POST' && pathname === '/api/v1/signals/extract') {
            await handleExtractSignals(req, res, evomap);
            return;
        }
        
        // Export endpoint
        if (req.method === 'GET' && pathname === '/api/v1/export') {
            await handleExport(req, res, evomap);
            return;
        }
        
        // Import endpoint
        if (req.method === 'POST' && pathname === '/api/v1/import') {
            await handleImport(req, res, evomap);
            return;
        }

        if (req.method === 'POST' && pathname === '/api/v1/feedback') {
            await handleFeedback(req, res, evomap);
            return;
        }

        // Distiller endpoints
        if (req.method === 'POST' && pathname === '/api/v1/distill/prepare') {
            await handleDistillPrepare(req, res, evomap);
            return;
        }
        
        if (req.method === 'POST' && pathname === '/api/v1/distill/complete') {
            await handleDistillComplete(req, res, evomap);
            return;
        }
        
        if (req.method === 'GET' && pathname === '/api/v1/distill/status') {
            await handleDistillStatus(req, res, evomap);
            return;
        }
        if (req.method === 'GET' && pathname === '/api/v1/distill/jobs') {
            await handleDistillJobsList(req, res);
            return;
        }

        if (pathname.startsWith('/api/v1/distill/jobs/')) {
            const parts = pathname.split('/').filter(Boolean);
            const jobId = decodeURIComponent(parts[4] || '');

            if (req.method === 'GET' && jobId) {
                await handleDistillJobGet(req, res, jobId);
                return;
            }
        }

        
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Hub endpoint not found' }));
        
    } catch (error) {
        console.error('[Hub API] Error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal server error' }));
    }
}

function resolveRequestBaseUrl(req: http.IncomingMessage): string {
    const protocolHeader = req.headers['x-forwarded-proto'];
    const forwardedProto = Array.isArray(protocolHeader) ? protocolHeader[0] : protocolHeader;
    const hostHeader = req.headers['x-forwarded-host'] || req.headers.host || `127.0.0.1:${PORT}`;
    const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
    const protocol = forwardedProto || 'http';
    return `${protocol}://${host}`;
}

async function handleAgentBootstrap(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL
): Promise<void> {
    const requestedClient = url.searchParams.get('client');
    let client: AgentClient | undefined;

    if (requestedClient) {
        if (!isAgentClient(requestedClient)) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Unknown agent client', client: requestedClient }));
            return;
        }
        client = requestedClient;
    }

    const checklist = await buildAgentBootstrapChecklist({
        projectRoot: PROJECT_ROOT,
        baseUrl: resolveRequestBaseUrl(req),
        client,
    });

    res.writeHead(200);
    res.end(JSON.stringify(checklist));
}

async function handleAgentManifest(
    req: http.IncomingMessage,
    res: http.ServerResponse
): Promise<void> {
    const manifest = await loadAgentManifest(PROJECT_ROOT);
    res.writeHead(200);
    res.end(JSON.stringify(manifest));
}

async function handleAgentCheck(
    req: http.IncomingMessage,
    res: http.ServerResponse
): Promise<void> {
    const body = await readRequestBody(req);

    let parsed: AgentCheckRequest;
    try {
        parsed = JSON.parse(body || '{}') as AgentCheckRequest;
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON body', detail: (error as Error).message }));
        return;
    }

    if (!parsed.client) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'client is required' }));
        return;
    }

    const manifest = await loadAgentManifest(PROJECT_ROOT);
    const result = evaluateAgentCompatibility(manifest, parsed);
    res.writeHead(200);
    res.end(JSON.stringify(result));
}

/**
 * Handle capsule search
 */
async function handleCapsuleSearch(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap,
    params: URLSearchParams
): Promise<void> {
    const rawSignalTerms = params.get('signals')?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const signals = normalizeSignals(rawSignalTerms);
    const gene = params.get('gene');
    const minConfidence = params.get('minConfidence') ? parseFloat(params.get('minConfidence')!) : 0;
    const limit = params.get('limit') ? parseInt(params.get('limit')!) : 100;
    const offset = params.get('offset') ? parseInt(params.get('offset')!) : 0;
    
    // Get all capsules from store
    const allCapsules = await evomap.getAllCapsules();
    const allGenes = await evomap.getAllGenes();
    
    // Filter by signals if provided
    let filtered = allCapsules.filter(c => {
        if (c._deleted) return false;
        if (signals.length > 0) {
            const matchesSignal = c.trigger.some(t => matchPatternToSignals(t, signals));
            const matchesText = rawSignalTerms.some(term => {
                const candidate = term.toLowerCase();
                return c.id?.toLowerCase().includes(candidate)
                    || c.gene?.toLowerCase().includes(candidate)
                    || c.summary?.toLowerCase().includes(candidate)
                    || c.trigger.some(trigger => trigger.toLowerCase().includes(candidate));
            });

            if (!matchesSignal && !matchesText) return false;
        }
        if (gene && c.gene !== gene) return false;
        if (c.confidence < minConfidence) return false;
        return true;
    });
    
    // Paginate
    const total = filtered.length;
    filtered = filtered.slice(offset, offset + limit);
    const resolvedCapsules = resolveCapsuleGenes(filtered, allGenes);
    
    // Extract unique tags and genes
    const tags = [...new Set(resolvedCapsules.flatMap(c => c.trigger))];
    const genes = [...new Set(resolvedCapsules.map(c => c.gene))];
    
    res.writeHead(200);
    res.end(JSON.stringify({
        total,
        capsules: resolvedCapsules,
        tags,
        genes
    }));
}

/**
 * Get capsule by ID
 */
async function handleCapsuleGet(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap,
    capsuleId: string
): Promise<void> {
    const capsule = await evomap.getCapsuleById(capsuleId);
    const genes = await evomap.getAllGenes();
    
    if (!capsule || capsule._deleted) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Capsule not found' }));
        return;
    }
    
    res.writeHead(200);
    res.end(JSON.stringify(resolveCapsuleGene(capsule, genes)));
}

/**
 * Download capsule by ID (returns as file attachment)
 */
async function handleCapsuleDownload(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap,
    capsuleId: string
): Promise<void> {
    // API Key authentication required for download
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }
    
    const capsule = await evomap.getCapsuleById(capsuleId);
    
    if (!capsule || capsule._deleted) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Capsule not found' }));
        return;
    }
    
    const content = JSON.stringify(capsule, null, 2);
    const filename = `capsule-${capsuleId}.json`;
    
    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': Buffer.byteLength(content)
    });
    res.end(content);
}

/**
 * List all genes with search support
 */
async function handleGenesList(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap,
    params: URLSearchParams
): Promise<void> {
    const search = params.get('q') || '';
    const category = params.get('category');
    const signal = params.get('signal');
    const signalTerms = signal ? signal.split(',').map(item => item.trim()).filter(Boolean) : [];
    const limit = params.get('limit') ? parseInt(params.get('limit')!) : 100;
    const offset = params.get('offset') ? parseInt(params.get('offset')!) : 0;
    
    // Get genes from store with filtering
    const allGenes = await evomap['geneStore'].getAll();
    let filteredGenes = allGenes.filter((g: Gene) => !g._deleted);
    
    // Apply filters
    if (search) {
        const searchLower = search.toLowerCase();
        filteredGenes = filteredGenes.filter((g: Gene) => 
            g.id?.toLowerCase().includes(searchLower) ||
            g.metadata?.description?.toLowerCase().includes(searchLower) ||
            g.signals_match?.some((s: string) => s.toLowerCase().includes(searchLower))
        );
    }
    
    if (category) {
        filteredGenes = filteredGenes.filter((g: Gene) => g.category === category);
    }
    
    if (signalTerms.length > 0) {
        filteredGenes = filteredGenes.filter((g: Gene) => 
            g.signals_match?.some((candidate: string) => signalTerms.some(term => matchPatternToSignals(candidate, [term])))
        );
    }
    
    const total = filteredGenes.length;
    const paginatedGenes = filteredGenes.slice(offset, offset + limit);
    
    res.writeHead(200);
    res.end(JSON.stringify({
        total,
        offset,
        limit,
        genes: paginatedGenes,
        categories: Array.from(new Set(allGenes.filter((g: Gene) => !g._deleted).map((g: Gene) => g.category))).filter(Boolean)
    }));
}

/**
 * Normalize capsule data: accept multiple formats and fill defaults
 */
function normalizeCapsule(raw: any): any {
    const capsule = { ...raw };
    // Default type
    if (!capsule.type) capsule.type = 'Capsule';
    // Default schema_version
    if (!capsule.schema_version) capsule.schema_version = '1.0.0';
    // Default id
    if (!capsule.id) capsule.id = `cap_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    // Normalize outcome: accept {success:true} or {status,score}
    if (capsule.outcome) {
        if (capsule.outcome.success !== undefined && !capsule.outcome.status) {
            capsule.outcome = {
                status: capsule.outcome.success ? 'success' : 'failed',
                score: capsule.confidence || 0.7,
                ...capsule.outcome
            };
            delete capsule.outcome.success;
        }
        if (!capsule.outcome.status) capsule.outcome.status = 'success';
        if (capsule.outcome.score === undefined) capsule.outcome.score = capsule.confidence || 0.7;
    } else {
        capsule.outcome = { status: 'success', score: capsule.confidence || 0.7 };
    }
    // Default env_fingerprint
    if (!capsule.env_fingerprint) {
        capsule.env_fingerprint = { platform: 'linux', arch: 'x64' };
    }
    // Default blast_radius
    if (!capsule.blast_radius) capsule.blast_radius = { files: 0, lines: 0 };
    // Default trigger
    if (!capsule.trigger) capsule.trigger = [];
    // Default confidence
    if (capsule.confidence === undefined) capsule.confidence = 0.7;
    // Default gene
    if (!capsule.gene) capsule.gene = 'unknown';
    // Default summary
    if (!capsule.summary) capsule.summary = '';
    // Default metadata
    if (!capsule.metadata) {
        capsule.metadata = { created_at: new Date().toISOString(), source: 'api', validated: false };
    }
    return capsule;
}

/**
 * Normalize gene data: accept multiple formats and fill defaults
 */
function normalizeGene(raw: any): any {
    const gene = { ...raw };
    // Default type
    if (!gene.type) gene.type = 'Gene';
    // Default id
    if (!gene.id) gene.id = `gene_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    // Accept "signals" as alias for "signals_match"
    if (gene.signals && !gene.signals_match) {
        gene.signals_match = gene.signals;
        delete gene.signals;
    }
    // Defaults
    if (!gene.signals_match) gene.signals_match = [];
    if (!gene.preconditions) gene.preconditions = [];
    if (!gene.strategy) gene.strategy = [];
    if (!gene.constraints) gene.constraints = {};
    if (!gene.category) gene.category = 'repair';
    return gene;
}

/**
 * Create capsule
 */
async function handleCapsuleCreate(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap
): Promise<void> {
    // API Key authentication required for write operations
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }
    
    const body = await readRequestBody(req);
    let parsed: any;
    try {
        parsed = JSON.parse(body);
    } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON', detail: (e as Error).message, received: body.substring(0, 200) }));
        return;
    }
    try {
        const allGenes = await evomap.getAllGenes();
        const capsule = resolveCapsuleGene(normalizeCapsule(parsed), allGenes);
        await evomap.addCapsule(capsule);
        res.writeHead(201);
        res.end(JSON.stringify({ message: 'Capsule created', id: capsule.id }));
    } catch (error) {
        console.error('[Hub API] Capsule create error:', error);
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Failed to create capsule', detail: (error as Error).message }));
    }
}

/**
 * Create gene
 */
async function handleGeneCreate(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap
): Promise<void> {
    // API Key authentication required for write operations
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }
    
    const body = await readRequestBody(req);
    let parsed: any;
    try {
        parsed = JSON.parse(body);
    } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON', detail: (e as Error).message, received: body.substring(0, 200) }));
        return;
    }
    try {
        const gene = normalizeGene(parsed);
        await evomap.addGene(gene);
        res.writeHead(201);
        res.end(JSON.stringify({ message: 'Gene created', id: gene.id }));
    } catch (error) {
        console.error('[Hub API] Gene create error:', error);
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Failed to create gene', detail: (error as Error).message }));
    }
}

/**
 * Read request body
 */
function readRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

/**
 * Get gene by ID
 */
async function handleGeneGet(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap,
    geneId: string
): Promise<void> {
    const gene = await evomap.getGeneById(geneId);
    if (!gene || gene._deleted) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Gene not found' }));
        return;
    }
    res.writeHead(200);
    res.end(JSON.stringify(gene));
}

/**
 * Update gene by ID
 */
async function handleGeneUpdate(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap,
    geneId: string
): Promise<void> {
    // API Key authentication required for write operations
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }
    
    const existing = await evomap['geneStore'].get(geneId);
    if (!existing || existing._deleted) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Gene not found' }));
        return;
    }
    
    const body = await readRequestBody(req);
    try {
        const updates = JSON.parse(body);
        const updated = { ...existing, ...updates, id: geneId };
        await evomap['geneStore'].update(updated);
        res.writeHead(200);
        res.end(JSON.stringify({ message: 'Gene updated', id: geneId }));
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid gene data' }));
    }
}

/**
 * Soft delete gene
 */
async function handleGeneDelete(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap,
    geneId: string
): Promise<void> {
    // API Key authentication required for write operations
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }
    
    const gene = await evomap['geneStore'].get(geneId);
    if (!gene) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Gene not found' }));
        return;
    }
    
    // Soft delete
    gene._deleted = true;
    gene._deleted_at = new Date().toISOString();
    await evomap['geneStore'].update(gene);
    
    res.writeHead(200);
    res.end(JSON.stringify({ message: 'Gene deleted', id: geneId }));
}

/**
 * Update capsule by ID
 */
async function handleCapsuleUpdate(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap,
    capsuleId: string
): Promise<void> {
    // API Key authentication required for write operations
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }
    
    const existing = await evomap['capsuleStore'].get(capsuleId);
    if (!existing || existing._deleted) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Capsule not found' }));
        return;
    }
    
    const body = await readRequestBody(req);
    try {
        const updates = JSON.parse(body);
        const updated = { ...existing, ...updates, id: capsuleId };
        await evomap['capsuleStore'].update(updated);
        res.writeHead(200);
        res.end(JSON.stringify({ message: 'Capsule updated', id: capsuleId }));
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid capsule data' }));
    }
}

/**
 * Soft delete capsule
 */
async function handleCapsuleDelete(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap,
    capsuleId: string
): Promise<void> {
    // API Key authentication required for write operations
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }
    
    const capsule = await evomap['capsuleStore'].get(capsuleId);
    if (!capsule) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Capsule not found' }));
        return;
    }
    
    // Soft delete
    capsule._deleted = true;
    capsule._deleted_at = new Date().toISOString();
    await evomap['capsuleStore'].update(capsule);
    
    res.writeHead(200);
    res.end(JSON.stringify({ message: 'Capsule deleted', id: capsuleId }));
}

/**
 * List events
 */
async function handleEventsList(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap,
    params: URLSearchParams
): Promise<void> {
    const limit = params.get('limit') ? parseInt(params.get('limit')!) : 50;
    const offset = params.get('offset') ? parseInt(params.get('offset')!) : 0;
    const search = params.get('q') || '';
    
    // Get events from store (newest first)
    const allEvents = await evomap['eventLogger'].getAll();
    let events = [...allEvents].reverse();
    
    // Apply search filter
    if (search) {
        const q = search.toLowerCase();
        events = events.filter((ev: EvolutionEvent) => {
            const gene = (ev.selected_gene || '').toLowerCase();
              const knowledgeStatus = (ev.knowledge_status || '').toLowerCase();
            const id = (ev.id || '').toLowerCase();
            const status = (ev.outcome?.status || '').toLowerCase();
            const signals = (ev.signals || []).join(' ').toLowerCase();
            return gene.includes(q) || id.includes(q) || status.includes(q) || signals.includes(q);
        });
    }
    
    const total = events.length;
    const paginatedEvents = events.slice(offset, offset + limit);
    
    res.writeHead(200);
    res.end(JSON.stringify({
        total,
        offset,
        limit,
        events: paginatedEvents
    }));
}

/**
 * Get event by ID
 */
async function handleEventGet(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap,
    eventId: string
): Promise<void> {
    const allEvents = await evomap['eventLogger'].getAll();
    const event = allEvents.find((e: EvolutionEvent) => e.id === eventId);
    
    if (!event) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Event not found' }));
        return;
    }
    
    res.writeHead(200);
    res.end(JSON.stringify(event));
}

/**
 * Seed the database with initial genes from data/seed-genes.json
 */
async function handleSeed(
    req: http.IncomingMessage,
    res: http.ServerResponse
): Promise<void> {
    res.setHeader('Content-Type', 'application/json');

    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }

    try {
        const evomap = await getEvomap();
        const projectRoot = __dirname.endsWith('dist') ? path.resolve(__dirname, '..') : __dirname;
        const seedPath = path.join(projectRoot, 'data', 'seed-genes.json');

        const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
        let created = 0;
        let skipped = 0;

        for (const raw of seedData) {
            const gene = normalizeGene(raw);
            const existing = await evomap.getGeneById(gene.id);
            if (existing && !existing._deleted) {
                skipped++;
                continue;
            }
            await evomap.addGene(gene);
            created++;
        }

        res.writeHead(200);
        res.end(JSON.stringify({ message: 'Seed complete', created, skipped, total: seedData.length }));
    } catch (error) {
        console.error('[Seed] Error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Seed failed', detail: (error as Error).message }));
    }
}

/**
 * List all capsules (no search filter)
 */
async function handleCapsulesList(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap
): Promise<void> {
    const allCapsules = await evomap.getAllCapsules();
    const allGenes = await evomap.getAllGenes();
    const activeCapsules = resolveCapsuleGenes(allCapsules.filter(c => !c._deleted), allGenes);
    
    res.writeHead(200);
    res.end(JSON.stringify({
        total: activeCapsules.length,
        capsules: activeCapsules
    }));
}

/**
 * Execute evolution from logs
 */
async function handleEvolve(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap
): Promise<void> {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }
    
    const body = await readRequestBody(req);
    let parsed: any;
    try {
        parsed = JSON.parse(body);
    } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON', detail: (e as Error).message }));
        return;
    }
    
    const logs = parsed.logs;
    if (!Array.isArray(logs)) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid_input', message: 'logs array is required and must not be empty' }));
        return;
    }
    if (logs.length === 0) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid_input', message: 'logs array is required and must not be empty' }));
        return;
    }
    
    // 提取 per-request 覆盖参数
    const overrides: { dryRun?: boolean; strategy?: string } = {};
    if (typeof parsed.dryRun === 'boolean') overrides.dryRun = parsed.dryRun;
    if (typeof parsed.strategy === 'string') overrides.strategy = parsed.strategy;
    
    try {
        const result: EvolutionResult = await evomap.evolve(
            logs,
            Object.keys(overrides).length > 0 ? overrides : undefined
        );
        res.writeHead(200);
        res.end(JSON.stringify({
            event: result.event,
            changes: result.changes,
            capsule_created: result.capsule_created,
            guidance: result.guidance
        }));
    } catch (error) {
        console.error('[Hub API] Evolve error:', error);
        const msg = (error as Error).message;
        
        if (error instanceof InvalidSignalContextError) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'invalid_input', message: msg }));
        } else if (error instanceof ApprovalRequiredError) {
            const pendingId = `pending_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            pendingApprovals.set(pendingId, {
                id: pendingId,
                timestamp: new Date().toISOString(),
                signals: error.context?.signals || [],
                geneId: error.context?.geneId || 'unknown',
                capsuleId: error.context?.capsuleId,
                changes: error.pendingChanges,
                blastRadius: error.blastRadius,
                confidence: error.context?.confidence || 0,
                logs: parsed.logs,
                status: 'pending'
            });
            res.writeHead(202);
            res.end(JSON.stringify({
                status: 'pending_approval',
                pending_id: pendingId,
                message: msg,
                blastRadius: error.blastRadius,
                changes_summary: error.pendingChanges.map(c => ({
                    file: c.file, operation: c.operation,
                    lines: c.content.split('\n').length,
                    reasoning: c.reasoning
                }))
            }));
        } else if (error instanceof NoMatchingGeneError || error instanceof AllGenesBannedError) {
            res.writeHead(422);
            res.end(JSON.stringify({ error: 'no_matching_gene', message: msg }));
        } else {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Evolution failed', detail: msg }));
        }
    }
}

async function handleTaskCreate(
    req: http.IncomingMessage,
    res: http.ServerResponse
): Promise<void> {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }

    const body = await readRequestBody(req);
    let parsed: any;
    try {
        parsed = JSON.parse(body || '{}');
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON body', detail: (error as Error).message }));
        return;
    }

    try {
        const service = await getEvolutionService();
        const result = await service.startTask({
            goal: parsed.goal,
            workspace: parsed.workspace,
            client: parsed.client,
            initialSignals: parsed.initialSignals
        });
        res.writeHead(200);
        res.end(JSON.stringify(result));
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Task creation failed', detail: (error as Error).message }));
    }
}

async function handleTaskGet(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    taskId: string
): Promise<void> {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }

    try {
        const service = await getEvolutionService();
        const result = await service.getTaskContext({ taskId });
        res.writeHead(200);
        res.end(JSON.stringify(result));
    } catch (error) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Task not found', detail: (error as Error).message }));
    }
}

async function handleTaskSearch(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    taskId: string
): Promise<void> {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }

    const body = await readRequestBody(req);
    let parsed: any = {};
    try {
        parsed = JSON.parse(body || '{}');
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON body', detail: (error as Error).message }));
        return;
    }

    try {
        const service = await getEvolutionService();
        const result = await service.searchKnowledge({
            taskId,
            signals: parsed.signals,
            query: parsed.query,
            workspace: parsed.workspace,
            limit: parsed.limit
        });
        res.writeHead(200);
        res.end(JSON.stringify(result));
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Task search failed', detail: (error as Error).message }));
    }
}

async function handleTaskUsage(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    taskId: string
): Promise<void> {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }

    const body = await readRequestBody(req);
    let parsed: any;
    try {
        parsed = JSON.parse(body || '{}');
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON body', detail: (error as Error).message }));
        return;
    }

    try {
        const service = await getEvolutionService();
        const result = await service.recordUsage({ taskId, knowledge: parsed.knowledge || [] });
        res.writeHead(200);
        res.end(JSON.stringify(result));
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Record usage failed', detail: (error as Error).message }));
    }
}

async function handleTaskFinalize(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    taskId: string
): Promise<void> {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }

    const body = await readRequestBody(req);
    let parsed: any;
    try {
        parsed = JSON.parse(body || '{}');
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON body', detail: (error as Error).message }));
        return;
    }

    try {
        const service = await getEvolutionService();
        const result = await service.finalizeTask({
            taskId,
            summary: parsed.summary,
            outcome: parsed.outcome,
            retrospective: parsed.retrospective,
            createCapsule: parsed.createCapsule
        });

        let distillMetadata: Record<string, unknown> = {};
        if (result.distillReady) {
            distillMetadata = await runAutomaticDistillation(await getEvomap());
        }

        res.writeHead(200);
        res.end(JSON.stringify({ ...result, ...distillMetadata }));
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Task finalization failed', detail: (error as Error).message }));
    }
}

async function handleKnowledgeSearch(
    req: http.IncomingMessage,
    res: http.ServerResponse
): Promise<void> {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }

    const body = await readRequestBody(req);
    let parsed: any = {};
    try {
        parsed = JSON.parse(body || '{}');
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON body', detail: (error as Error).message }));
        return;
    }

    try {
        const service = await getEvolutionService();
        const result = await service.searchKnowledge({
            taskId: parsed.taskId,
            signals: parsed.signals,
            query: parsed.query,
            workspace: parsed.workspace,
            limit: parsed.limit
        });
        res.writeHead(200);
        res.end(JSON.stringify(result));
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Knowledge search failed', detail: (error as Error).message }));
    }
}

async function handleWorkspacePlaybook(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    workspace: string
): Promise<void> {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }

    try {
        const service = await getEvolutionService();
        const result = await service.getWorkspacePlaybook(workspace);
        res.writeHead(200);
        res.end(JSON.stringify(result));
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Workspace playbook failed', detail: (error as Error).message }));
    }
}

async function handleWorkspaceRecentSuccesses(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    workspace: string
): Promise<void> {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }

    try {
        const service = await getEvolutionService();
        const result = await service.getWorkspaceRecentSuccesses(workspace);
        res.writeHead(200);
        res.end(JSON.stringify(result));
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Workspace recent successes failed', detail: (error as Error).message }));
    }
}

async function handleFeedback(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap
): Promise<void> {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }

    const body = await readRequestBody(req);
    let parsed: any;
    try {
        parsed = JSON.parse(body);
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON', detail: (error as Error).message }));
        return;
    }

    try {
        const result = await evomap.submitFeedback(parsed);
        res.writeHead(200);
        res.end(JSON.stringify(result));
    } catch (error) {
        console.error('[Hub API] Feedback error:', error);
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Feedback failed', detail: (error as Error).message }));
    }
}

/**
 * Extract signals from logs
 */
async function handleExtractSignals(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap
): Promise<void> {
    const body = await readRequestBody(req);
    let parsed: any;
    try {
        parsed = JSON.parse(body);
    } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON', detail: (e as Error).message }));
        return;
    }
    
    const logs = parsed.logs;
    if (!Array.isArray(logs)) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing or invalid "logs" array' }));
        return;
    }
    
    try {
        const result = evomap.extractSignalsDetailed(logs);
        res.writeHead(200);
        res.end(JSON.stringify({
            signals: result.signals,
            prioritySignals: result.prioritySignals,
            stats: result.stats
        }));
    } catch (error) {
        console.error('[Hub API] ExtractSignals error:', error);
        if (error instanceof InvalidSignalContextError) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'invalid_input', detail: (error as Error).message }));
        } else {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Signal extraction failed', detail: (error as Error).message }));
        }
    }
}

/**
 * Select best gene for given signals
 */
async function handleSelectGene(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap
): Promise<void> {
    const body = await readRequestBody(req);
    let parsed: any;
    try {
        parsed = JSON.parse(body);
    } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON', detail: (e as Error).message }));
        return;
    }
    
    if (!Array.isArray(parsed.signals)) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing or invalid "signals" array' }));
        return;
    }
    const signals = normalizeSignals(parsed.signals);
    
    try {
        const result = await evomap.selectGene(signals);
        // scoring.all_scores 可能是 Map，需要转换为普通对象以支持 JSON 序列化
        const scoring = result.scoring;
        const serialized = {
            ...result,
            scoring: {
                ...scoring,
                all_scores: scoring?.all_scores instanceof Map
                    ? Object.fromEntries(scoring.all_scores)
                    : scoring?.all_scores
            }
        };
        res.writeHead(200);
        res.end(JSON.stringify(serialized));
    } catch (error) {
        console.error('[Hub API] SelectGene error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Gene selection failed', detail: (error as Error).message }));
    }
}

/**
 * Select best capsule for given signals
 */
async function handleSelectCapsule(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap
): Promise<void> {
    const body = await readRequestBody(req);
    let parsed: any;
    try {
        parsed = JSON.parse(body);
    } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON', detail: (e as Error).message }));
        return;
    }
    
    if (!Array.isArray(parsed.signals)) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing or invalid "signals" array' }));
        return;
    }
    const signals = normalizeSignals(parsed.signals);
    
    try {
        const capsule = await evomap.selectCapsule(signals);
        if (!capsule) {
            res.writeHead(200);
            res.end(JSON.stringify({ capsule: null, reuse: null }));
            return;
        }
        const reuse = shouldReuseCapsule(capsule, signals);
        res.writeHead(200);
        res.end(JSON.stringify({ capsule, reuse }));
    } catch (error) {
        console.error('[Hub API] SelectCapsule error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Capsule selection failed', detail: (error as Error).message }));
    }
}

/**
 * Export all data (genes, capsules, events, config)
 */
async function handleExport(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap
): Promise<void> {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }
    
    try {
        const data = await evomap.exportData();
        res.writeHead(200);
        res.end(JSON.stringify(data));
    } catch (error) {
        console.error('[Hub API] Export error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Export failed', detail: (error as Error).message }));
    }
}

/**
 * Import data (genes and/or capsules)
 */
async function handleImport(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap
): Promise<void> {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }
    
    const body = await readRequestBody(req);
    let parsed: any;
    try {
        parsed = JSON.parse(body);
    } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON', detail: (e as Error).message }));
        return;
    }
    
    if (!parsed.genes && !parsed.capsules) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Request must include "genes" and/or "capsules" arrays' }));
        return;
    }
    
    try {
        await evomap.importData(parsed);
        const genesCount = parsed.genes?.length || 0;
        const capsulesCount = parsed.capsules?.length || 0;
        res.writeHead(200);
        res.end(JSON.stringify({
            message: 'Import complete',
            imported: { genes: genesCount, capsules: capsulesCount }
        }));
    } catch (error) {
        console.error('[Hub API] Import error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Import failed', detail: (error as Error).message }));
    }
}

/**
 * Prepare distillation (phase 1)
 */
async function handleDistillPrepare(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap
): Promise<void> {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }
    
    try {
        const result = await evomap.prepareDistillation();
        if (!result) {
            res.writeHead(200);
            res.end(JSON.stringify({ 
                distillation: null, 
                message: 'Distillation conditions not met (min capsules, interval, or success rate)' 
            }));
            return;
        }
        
        res.writeHead(200);
        res.end(JSON.stringify({ distillation: result }));
    } catch (error) {
        console.error('[Hub API] Distill prepare error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Distillation preparation failed', detail: (error as Error).message }));
    }
}

/**
 * Complete distillation (phase 2)
 */
async function handleDistillComplete(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap
): Promise<void> {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }
    
    const body = await readRequestBody(req);
    let parsed: any;
    try {
        parsed = JSON.parse(body);
    } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON', detail: (e as Error).message }));
        return;
    }
    
    if (!parsed.responseText || typeof parsed.responseText !== 'string') {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing "responseText" field' }));
        return;
    }
    
    try {
        const result = await evomap.completeDistillation(
            parsed.responseText,
            parsed.sourceCapsuleIds
        );
        
        const statusCode = result.success ? 201 : 422;
        res.writeHead(statusCode);
        res.end(JSON.stringify(result));
    } catch (error) {
        console.error('[Hub API] Distill complete error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Distillation completion failed', detail: (error as Error).message }));
    }
}

/**
 * Check distillation readiness
 */
async function handleDistillStatus(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap
): Promise<void> {
    try {
        const ready = await evomap.shouldDistill();
        res.writeHead(200);
        res.end(JSON.stringify({ ready }));
    } catch (error) {
        console.error('[Hub API] Distill status error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Status check failed', detail: (error as Error).message }));
    }
}

async function handleDistillJobsList(
    req: http.IncomingMessage,
    res: http.ServerResponse
): Promise<void> {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }

    try {
        const jobStore = await getDistillJobStore();
        const jobs = (await jobStore.getAll())
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        res.writeHead(200);
        res.end(JSON.stringify({ jobs }));
    } catch (error) {
        console.error('[Hub API] Distill job list error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Distill job list failed', detail: (error as Error).message }));
    }
}

async function handleDistillJobGet(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    jobId: string
): Promise<void> {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }

    try {
        const jobStore = await getDistillJobStore();
        const job = await jobStore.get(jobId);
        if (!job) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Distill job not found' }));
            return;
        }

        res.writeHead(200);
        res.end(JSON.stringify(job));
    } catch (error) {
        console.error('[Hub API] Distill job get error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Distill job lookup failed', detail: (error as Error).message }));
    }
}

/**
 * List pending approvals
 */
function handlePendingList(
    req: http.IncomingMessage,
    res: http.ServerResponse
): void {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }
    
    const items = Array.from(pendingApprovals.values())
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    res.writeHead(200);
    res.end(JSON.stringify({
        total: items.length,
        pending: items.filter(i => i.status === 'pending').length,
        items: items.map(item => ({
            id: item.id,
            timestamp: item.timestamp,
            status: item.status,
            geneId: item.geneId,
            signals: item.signals.slice(0, 5),
            blastRadius: item.blastRadius,
            changes_count: item.changes.length,
            resolvedAt: item.resolvedAt
        }))
    }));
}

/**
 * Get pending approval details
 */
function handlePendingGet(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pendingId: string
): void {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }
    
    const item = pendingApprovals.get(pendingId);
    if (!item) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Pending approval not found' }));
        return;
    }
    
    res.writeHead(200);
    res.end(JSON.stringify(item));
}

/**
 * Approve a pending evolution
 */
async function handlePendingApprove(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    evomap: LocalEvomap,
    pendingId: string
): Promise<void> {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }
    
    const item = pendingApprovals.get(pendingId);
    if (!item) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Pending approval not found' }));
        return;
    }
    if (item.status !== 'pending') {
        res.writeHead(409);
        res.end(JSON.stringify({ error: `Already ${item.status}`, resolvedAt: item.resolvedAt }));
        return;
    }
    
    try {
        const totalLinesAdded = item.changes.reduce(
            (sum, c) => sum + c.content.split('\n').length, 0
        );
        const totalLinesRemoved = item.changes
            .filter(c => c.operation === 'delete')
            .reduce((sum, c) => sum + c.content.split('\n').length, 0);
        
        const outcomeScore = Math.max(0, Math.min(0.95,
            (item.confidence * 0.6) + (1 * 0.4) -
            (item.blastRadius.riskLevel === 'high' ? 0.15 : item.blastRadius.riskLevel === 'medium' ? 0.05 : 0)
        ));
        
        const event: EvolutionEvent = {
            id: `event_approved_${Date.now()}`,
            timestamp: new Date().toISOString(),
            signals: item.signals,
            selected_gene: item.geneId,
            used_capsule: item.capsuleId,
            outcome: {
                status: 'success',
                score: Number(outcomeScore.toFixed(4)),
                changes: {
                    files_modified: item.changes.length,
                    lines_added: totalLinesAdded,
                    lines_removed: totalLinesRemoved
                }
            },
            validation: {
                passed: true,
                commands_run: 0
            },
            metadata: {
                session_id: 'approval',
                iteration: 0,
                blast_radius: {
                    files: item.blastRadius.files,
                    lines: item.blastRadius.lines,
                    risk_level: item.blastRadius.riskLevel
                },
                approved_from: pendingId,
                warnings: []
            }
        };
        
        await evomap['eventLogger'].append(event);
        
        const capsule = normalizeCapsule({
            trigger: item.signals.slice(0, 10),
            gene: item.geneId,
            summary: `Approved evolution (${item.blastRadius.riskLevel} risk)`,
            confidence: Math.max(0.7, outcomeScore),
            blast_radius: {
                files: item.changes.length,
                lines: totalLinesAdded
            },
            outcome: { status: 'success', score: outcomeScore }
        });
        await evomap.addCapsule(capsule);
        
        item.status = 'approved';
        item.resolvedAt = new Date().toISOString();
        
        res.writeHead(200);
        res.end(JSON.stringify({
            message: 'Evolution approved and recorded',
            event_id: event.id,
            capsule_id: capsule.id,
            outcome_score: outcomeScore
        }));
    } catch (error) {
        console.error('[Hub API] Approve error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Approval failed', detail: (error as Error).message }));
    }
}

/**
 * Reject a pending evolution
 */
function handlePendingReject(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pendingId: string
): void {
    if (!checkApiKey(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
    }
    
    const item = pendingApprovals.get(pendingId);
    if (!item) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Pending approval not found' }));
        return;
    }
    if (item.status !== 'pending') {
        res.writeHead(409);
        res.end(JSON.stringify({ error: `Already ${item.status}`, resolvedAt: item.resolvedAt }));
        return;
    }
    
    item.status = 'rejected';
    item.resolvedAt = new Date().toISOString();
    
    res.writeHead(200);
    res.end(JSON.stringify({ message: 'Evolution rejected', id: pendingId }));
}

if (require.main === module) {
    const server = createHttpServer();
    server.listen(PORT, HOST, () => {
        console.log(`LocalEvomap Core Server running at http://${HOST}:${PORT}`);
        void getDefaultPluginManager().catch((error) => {
            console.error('[Server] Plugin bootstrap failed:', error);
        });
    });
}






