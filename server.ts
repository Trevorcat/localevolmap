import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { LocalEvomap } from './index';
import type { Gene, Capsule, EvolutionEvent } from './types/gene-capsule-schema';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

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

async function getEvomap(): Promise<LocalEvomap> {
    if (!evomap) {
        evomap = new LocalEvomap();
        await evomap.init();
        console.log('[Server] LocalEvomap initialized');
    }
    return evomap;
}

const server = http.createServer(async (req, res) => {
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
        const filePath = path.join(__dirname, 'public', 'index.html');
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
        const projectRoot = __dirname.endsWith('dist') ? path.resolve(__dirname, '..') : __dirname;
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
        const projectRoot = __dirname.endsWith('dist') ? path.resolve(__dirname, '..') : __dirname;
        const skillDir = path.join(projectRoot, 'opencode', 'localevomap-skill');
        
        // Map client types to files
        const clientFileMap: Record<string, string> = {
            'claude': 'claude-code.md',
            'opencode': 'opencode-skill.md',
            'codex': 'codex-agents.md',
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

    // Hub API v1 endpoints (check first, before legacy /api/)
    if (url.pathname.startsWith('/api/v1/')) {
        console.log('[Server] Hub API request:', req.method, url.pathname);
        await handleHubApi(req, res, url);
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

/**
 * Handle Hub API v1 requests
 */
async function handleHubApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL
): Promise<void> {
    res.setHeader('Content-Type', 'application/json');
    
    const pathname = url.pathname;
    
    try {
        const evomap = await getEvomap();
        
        // GET /api/v1/capsules/search
        if (req.method === 'GET' && pathname === '/api/v1/capsules/search') {
            await handleCapsuleSearch(req, res, evomap, url.searchParams);
            return;
        }
        
        // GET /api/v1/capsules/:id or /api/v1/capsules/:id/download
        if (req.method === 'GET' && pathname.startsWith('/api/v1/capsules/')) {
            const parts = pathname.split('/');
            if (parts.length >= 5) {
                const capsuleId = parts[4];
                const isDownload = parts[5] === 'download';
                
                if (isDownload) {
                    await handleCapsuleDownload(req, res, evomap, capsuleId);
                } else {
                    await handleCapsuleGet(req, res, evomap, capsuleId);
                }
                return;
            }
        }
        
        // Gene endpoints
        if (pathname.startsWith('/api/v1/genes/')) {
            const parts = pathname.split('/');
            const geneId = parts[4];
            
            if (req.method === 'GET') {
                await handleGeneGet(req, res, evomap, geneId);
            } else if (req.method === 'PUT') {
                await handleGeneUpdate(req, res, evomap, geneId);
                return;
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
        
        // Capsule endpoints
        if (pathname.startsWith('/api/v1/capsules/')) {
            const parts = pathname.split('/');
            const capsuleId = parts[4];
            const isDownload = parts[5] === 'download';
            
            if (isDownload) {
                await handleCapsuleDownload(req, res, evomap, capsuleId);
            } else if (req.method === 'GET') {
                await handleCapsuleGet(req, res, evomap, capsuleId);
            } else if (req.method === 'PUT') {
                await handleCapsuleUpdate(req, res, evomap, capsuleId);
                return;
            } else if (req.method === 'DELETE') {
                await handleCapsuleDelete(req, res, evomap, capsuleId);
            } else {
                res.writeHead(405);
                res.end(JSON.stringify({ error: 'Method not allowed' }));
            }
            return;
        }
        
        if (req.method === 'GET' && pathname === '/api/v1/capsules/search') {
            await handleCapsuleSearch(req, res, evomap, url.searchParams);
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
        
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Hub endpoint not found' }));
        
    } catch (error) {
        console.error('[Hub API] Error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal server error' }));
    }
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
    const signals = params.get('signals')?.split(',').filter(s => s.trim()) || [];
    const gene = params.get('gene');
    const minConfidence = params.get('minConfidence') ? parseFloat(params.get('minConfidence')!) : 0;
    const limit = params.get('limit') ? parseInt(params.get('limit')!) : 100;
    const offset = params.get('offset') ? parseInt(params.get('offset')!) : 0;
    
    // Get all capsules from store
    const allCapsules = await evomap.getAllCapsules();
    
    // Filter by signals if provided
    let filtered = allCapsules.filter(c => {
        if (c._deleted) return false;
        if (signals.length > 0 && !c.trigger.some(t => signals.some(s => t.includes(s)))) return false;
        if (gene && c.gene !== gene) return false;
        if (c.confidence < minConfidence) return false;
        return true;
    });
    
    // Paginate
    const total = filtered.length;
    filtered = filtered.slice(offset, offset + limit);
    
    // Extract unique tags and genes
    const tags = [...new Set(filtered.flatMap(c => c.trigger))];
    const genes = [...new Set(filtered.map(c => c.gene))];
    
    res.writeHead(200);
    res.end(JSON.stringify({
        total,
        capsules: filtered,
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
    
    if (!capsule || capsule._deleted) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Capsule not found' }));
        return;
    }
    
    res.writeHead(200);
    res.end(JSON.stringify(capsule));
}

/**
 * Download capsule by ID
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
    
    // TODO: Implement actual capsule lookup and download
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Capsule not found' }));
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
    
    if (signal) {
        filteredGenes = filteredGenes.filter((g: Gene) => 
            g.signals_match?.some((s: string) => s.toLowerCase().includes(signal.toLowerCase()))
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
    try {
        const capsule = JSON.parse(body);
        await evomap.addCapsule(capsule);
        res.writeHead(201);
        res.end(JSON.stringify({ message: 'Capsule created', id: capsule.id }));
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid capsule data' }));
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
    try {
        const gene = JSON.parse(body);
        await evomap.addGene(gene);
        res.writeHead(201);
        res.end(JSON.stringify({ message: 'Gene created', id: gene.id }));
    } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid gene data' }));
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
    
    const stats = await evomap.getEventStats();
    
    // Get events from store
    const allEvents = await evomap['eventLogger'].getAll();
    const total = allEvents.length;
    const paginatedEvents = allEvents.slice(offset, offset + limit);
    
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

server.listen(PORT, HOST, () => {
    console.log(`LocalEvomap Core Server running at http://${HOST}:${PORT}`);
});
