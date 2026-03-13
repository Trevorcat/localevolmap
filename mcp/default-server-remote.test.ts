import * as fs from 'fs/promises';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { LocalEvomap, DEFAULT_CONFIG } from '../index';
import { createHttpServer } from '../server';
import { createDefaultMcpServer } from './server';
import type { Capsule, Gene } from '../types/gene-capsule-schema';

describe('createDefaultMcpServer remote integration', () => {
  let remoteServer: http.Server;
  let remoteRoot: string;
  const originalEnv = {
    GENES_PATH: process.env.GENES_PATH,
    CAPSULES_PATH: process.env.CAPSULES_PATH,
    EVENTS_PATH: process.env.EVENTS_PATH,
    TASKS_PATH: process.env.TASKS_PATH,
    DISTILL_JOBS_PATH: process.env.DISTILL_JOBS_PATH,
    LOCAL_EVOMAP_SERVER_URL: process.env.LOCAL_EVOMAP_SERVER_URL,
    LOCAL_EVOMAP_CLIENT: process.env.LOCAL_EVOMAP_CLIENT,
    LOCAL_EVOMAP_SKILL_PATH: process.env.LOCAL_EVOMAP_SKILL_PATH,
    LOCAL_EVOMAP_API_KEY: process.env.LOCAL_EVOMAP_API_KEY,
    HUB_API_KEY: process.env.HUB_API_KEY,
  };
  const currentPlatform = (['linux', 'darwin', 'win32'].includes(process.platform) ? process.platform : 'linux') as 'linux' | 'darwin' | 'win32';
  const currentArch = (['x64', 'arm64', 'ia32'].includes(process.arch) ? process.arch : 'x64') as 'x64' | 'arm64' | 'ia32';

  beforeAll(async () => {
    remoteRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'localevomap-default-mcp-remote-'));
    process.env.GENES_PATH = path.join(remoteRoot, 'genes');
    process.env.CAPSULES_PATH = path.join(remoteRoot, 'capsules');
    process.env.EVENTS_PATH = path.join(remoteRoot, 'events');
    process.env.TASKS_PATH = path.join(remoteRoot, 'tasks');
    process.env.DISTILL_JOBS_PATH = path.join(remoteRoot, 'distill-jobs');
    process.env.HUB_API_KEY = 'test-api-key';
    process.env.LOCAL_EVOMAP_API_KEY = 'test-api-key';
    process.env.LOCAL_EVOMAP_CLIENT = 'codex';
    process.env.LOCAL_EVOMAP_SKILL_PATH = path.resolve('opencode/localevomap-skill/codex-agents.md');

    const evomap = new LocalEvomap({
      ...DEFAULT_CONFIG,
      genes_path: process.env.GENES_PATH,
      capsules_path: process.env.CAPSULES_PATH,
      events_path: process.env.EVENTS_PATH,
      review_mode: false
    });
    await evomap.init();

    const gene: Gene = {
      type: 'Gene',
      id: 'gene_default_remote',
      category: 'feature',
      signals_match: ['default-mcp-remote', 'bootstrap'],
      preconditions: [],
      strategy: ['use remote authoritative backend'],
      constraints: {}
    };

    const capsule: Capsule = {
      type: 'Capsule',
      schema_version: '1.5.0',
      id: 'capsule_default_remote',
      trigger: ['default-mcp-remote', 'bootstrap'],
      gene: gene.id,
      summary: 'Default MCP server should consume remote task APIs.',
      confidence: 0.9,
      blast_radius: { files: 1, lines: 3 },
      outcome: { status: 'success', score: 0.92 },
      env_fingerprint: { platform: currentPlatform, arch: currentArch, node_version: process.version },
      metadata: { created_at: '2026-03-13T00:00:00.000Z', source: 'local', validated: true }
    };

    await evomap.addGene(gene);
    await evomap.addCapsule(capsule);

    remoteServer = createHttpServer();
    await new Promise<void>(resolve => remoteServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (remoteServer.address() as AddressInfo).port;
    process.env.LOCAL_EVOMAP_SERVER_URL = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => remoteServer.close(error => error ? reject(error) : resolve()));
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(remoteRoot, { recursive: true, force: true });
  });

  test('uses the remote task backend and workspace resources by default', async () => {
    const server = await createDefaultMcpServer();

    const started = await server.callTool('start_task', {
      goal: 'verify remote-backed default MCP startup',
      workspace: 'capability',
      client: 'codex',
      initialSignals: ['default-mcp-remote', 'bootstrap']
    });

    expect(started.recommendedGenes.map((item: Gene) => item.id)).toContain('gene_default_remote');
    expect(started.recommendedCapsules.map((item: Capsule) => item.id)).toContain('capsule_default_remote');

    await server.callTool('record_usage', {
      taskId: started.taskId,
      knowledge: [
        { kind: 'gene', id: 'gene_default_remote', phase: 'plan' },
        { kind: 'capsule', id: 'capsule_default_remote', phase: 'implement' }
      ]
    });

    await server.callTool('finalize_task', {
      taskId: started.taskId,
      summary: 'Default MCP server finalized through remote APIs.',
      outcome: { status: 'success', score: 0.94 },
      retrospective: {
        signals: ['default-mcp-remote', 'bootstrap'],
        selfMistakes: [],
        userCorrections: [],
        validations: [{ command: 'npm run build', passed: true }]
      },
      createCapsule: false
    });

    const playbook = await server.readResource('evomap://workspace/capability/playbook');
    const payload = JSON.parse(playbook.contents[0].text);
    const taskFiles = await fs.readdir(process.env.TASKS_PATH!);

    expect(payload.recommendedGenes).toContain('gene_default_remote');
    expect(taskFiles.some(file => file.endsWith('.json'))).toBe(true);
  });
});
