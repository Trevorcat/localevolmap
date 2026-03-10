import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { LocalEvomap, DEFAULT_CONFIG } from '../index';
import { TaskSessionStore } from '../storage/task-session-store';
import { EvolutionService } from '../core/evolution-service';
import { createMcpServer } from './server';
import type { Capsule, Gene } from '../types/gene-capsule-schema';

describe('LocalEvomap MCP server', () => {
  const currentPlatform = (['linux', 'darwin', 'win32'].includes(process.platform) ? process.platform : 'linux') as 'linux' | 'darwin' | 'win32';
  const currentArch = (['x64', 'arm64', 'ia32'].includes(process.arch) ? process.arch : 'x64') as 'x64' | 'arm64' | 'ia32';

  async function createTempRoot(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), 'localevomap-mcp-server-'));
  }

  async function createServer() {
    const root = await createTempRoot();
    const evomap = new LocalEvomap({
      ...DEFAULT_CONFIG,
      genes_path: path.join(root, 'genes'),
      capsules_path: path.join(root, 'capsules'),
      events_path: path.join(root, 'events'),
      review_mode: false
    });
    await evomap.init();

    const taskStore = new TaskSessionStore(path.join(root, 'tasks'));
    await taskStore.init();

    const evolutionService = new EvolutionService({ evomap, taskStore });
    return { server: createMcpServer({ evolutionService }), evomap };
  }

  afterEach(async () => {
    const tmpRoot = os.tmpdir();
    const entries = await fs.readdir(tmpRoot, { withFileTypes: true });
    await Promise.all(entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('localevomap-mcp-server-'))
      .map(entry => fs.rm(path.join(tmpRoot, entry.name), { recursive: true, force: true })));
  });

  test('registers all required MCP tools', async () => {
    const { server } = await createServer();
    const tools = await server.listTools();

    expect(tools.map((tool: { name: string }) => tool.name)).toEqual(expect.arrayContaining([
      'start_task',
      'search_knowledge',
      'record_usage',
      'get_task_context',
      'finalize_task'
    ]));
  });

  test('makes finalize_task idempotent per taskId', async () => {
    const { server, evomap } = await createServer();

    const gene: Gene = {
      type: 'Gene',
      id: 'gene_mcp_finalize',
      category: 'feature',
      signals_match: ['mcp', 'task-complete'],
      preconditions: [],
      strategy: ['track task session', 'finalize once'],
      constraints: {}
    };

    const capsule: Capsule = {
      type: 'Capsule',
      schema_version: '1.5.0',
      id: 'capsule_mcp_finalize',
      trigger: ['mcp', 'task-complete'],
      gene: gene.id,
      summary: 'Finalize through MCP once per task.',
      confidence: 0.84,
      blast_radius: { files: 1, lines: 6 },
      outcome: { status: 'success', score: 0.84 },
      env_fingerprint: { platform: currentPlatform, arch: currentArch, node_version: process.version },
      metadata: { created_at: '2026-03-10T00:00:00.000Z', source: 'local', validated: true }
    };

    await evomap.addGene(gene);
    await evomap.addCapsule(capsule);

    const started = await server.callTool('start_task', {
      goal: 'implement MCP server',
      workspace: 'capability',
      client: 'codex',
      initialSignals: ['mcp', 'task-complete']
    });

    await server.callTool('record_usage', {
      taskId: started.taskId,
      knowledge: [
        { kind: 'gene', id: gene.id, phase: 'implement' },
        { kind: 'capsule', id: capsule.id, phase: 'implement' }
      ]
    });

    const payload = {
      taskId: started.taskId,
      summary: 'The agent now finalizes through MCP.',
      outcome: { status: 'success', score: 0.94 },
      retrospective: {
        signals: ['mcp', 'task-complete'],
        selfMistakes: ['Initially attempted a compatibility layer'],
        userCorrections: ['User asked for a direct redesign'],
        validations: [{ command: 'npm run build', passed: true }]
      },
      createCapsule: true
    };

    const first = await server.callTool('finalize_task', payload);
    const second = await server.callTool('finalize_task', payload);

    expect(second.eventId).toBe(first.eventId);
    expect(second.taskId).toBe(first.taskId);
  });

  test('returns a workspace playbook resource after finalized tasks', async () => {
    const { server, evomap } = await createServer();

    const gene: Gene = {
      type: 'Gene',
      id: 'gene_workspace_playbook',
      category: 'feature',
      signals_match: ['mcp', 'workspace'],
      preconditions: [],
      strategy: ['read the workspace playbook first'],
      constraints: {}
    };

    const capsule: Capsule = {
      type: 'Capsule',
      schema_version: '1.5.0',
      id: 'capsule_workspace_playbook',
      trigger: ['mcp', 'workspace'],
      gene: gene.id,
      summary: 'Workspace playbook should highlight proven MCP guidance.',
      confidence: 0.88,
      blast_radius: { files: 1, lines: 5 },
      outcome: { status: 'success', score: 0.9 },
      env_fingerprint: { platform: currentPlatform, arch: currentArch, node_version: process.version },
      metadata: { created_at: '2026-03-10T00:00:00.000Z', source: 'local', validated: true }
    };

    await evomap.addGene(gene);
    await evomap.addCapsule(capsule);

    const started = await server.callTool('start_task', {
      goal: 'prepare workspace playbook',
      workspace: 'capability',
      client: 'codex',
      initialSignals: ['mcp', 'workspace']
    });

    await server.callTool('record_usage', {
      taskId: started.taskId,
      knowledge: [
        { kind: 'gene', id: gene.id, phase: 'plan' },
        { kind: 'capsule', id: capsule.id, phase: 'implement' }
      ]
    });

    await server.callTool('finalize_task', {
      taskId: started.taskId,
      summary: 'Workspace-scoped MCP guidance is now available.',
      outcome: { status: 'success', score: 0.91 },
      retrospective: {
        signals: ['mcp', 'workspace'],
        selfMistakes: [],
        userCorrections: [],
        validations: [{ command: 'npm run build', passed: true }]
      },
      createCapsule: false
    });

    const resource = await server.readResource('evomap://workspace/capability/playbook');
    const payload = JSON.parse(resource.contents[0].text);

    expect(payload.workspace).toBe('capability');
    expect(payload.recommendedGenes).toContain(gene.id);
    expect(payload.recentCapsules).toContain(capsule.id);
  });

  test('returns recent successful task summaries for a workspace', async () => {
    const { server, evomap } = await createServer();

    const gene: Gene = {
      type: 'Gene',
      id: 'gene_recent_success',
      category: 'feature',
      signals_match: ['mcp', 'success'],
      preconditions: [],
      strategy: ['surface recent successful tasks'],
      constraints: {}
    };

    const capsule: Capsule = {
      type: 'Capsule',
      schema_version: '1.5.0',
      id: 'capsule_recent_success',
      trigger: ['mcp', 'success'],
      gene: gene.id,
      summary: 'Recent successful tasks should be readable as a workspace resource.',
      confidence: 0.87,
      blast_radius: { files: 1, lines: 4 },
      outcome: { status: 'success', score: 0.9 },
      env_fingerprint: { platform: currentPlatform, arch: currentArch, node_version: process.version },
      metadata: { created_at: '2026-03-10T00:00:00.000Z', source: 'local', validated: true }
    };

    await evomap.addGene(gene);
    await evomap.addCapsule(capsule);

    const started = await server.callTool('start_task', {
      goal: 'publish recent successes resource',
      workspace: 'capability',
      client: 'codex',
      initialSignals: ['mcp', 'success']
    });

    await server.callTool('record_usage', {
      taskId: started.taskId,
      knowledge: [
        { kind: 'gene', id: gene.id, phase: 'plan' },
        { kind: 'capsule', id: capsule.id, phase: 'implement' }
      ]
    });

    await server.callTool('finalize_task', {
      taskId: started.taskId,
      summary: 'Published the recent successes workspace resource.',
      outcome: { status: 'success', score: 0.92 },
      retrospective: {
        signals: ['mcp', 'success'],
        selfMistakes: [],
        userCorrections: [],
        validations: [{ command: 'npm run build', passed: true }]
      },
      createCapsule: false
    });

    const resource = await server.readResource('evomap://workspace/capability/recent-successes');
    const payload = JSON.parse(resource.contents[0].text);

    expect(payload.workspace).toBe('capability');
    expect(payload.summaries).toContain('Published the recent successes workspace resource.');
    expect(payload.capsules).toContain(capsule.id);
  });
});
