import * as fs from 'fs/promises';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { LocalEvomap, DEFAULT_CONFIG } from '../index';
import { createHttpServer } from '../server';
import { RemoteEvolutionClient } from './remote-evolution-client';
import type { Capsule, Gene } from '../core/types/gene-capsule-schema';

describe('RemoteEvolutionClient', () => {
  let server: http.Server;
  let port: number;
  let root: string;
  const originalEnv = {
    GENES_PATH: process.env.GENES_PATH,
    CAPSULES_PATH: process.env.CAPSULES_PATH,
    EVENTS_PATH: process.env.EVENTS_PATH,
    TASKS_PATH: process.env.TASKS_PATH,
    DISTILL_JOBS_PATH: process.env.DISTILL_JOBS_PATH,
  };
  const currentPlatform = (['linux', 'darwin', 'win32'].includes(process.platform) ? process.platform : 'linux') as 'linux' | 'darwin' | 'win32';
  const currentArch = (['x64', 'arm64', 'ia32'].includes(process.arch) ? process.arch : 'x64') as 'x64' | 'arm64' | 'ia32';

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'localevomap-remote-client-'));
    process.env.GENES_PATH = path.join(root, 'genes');
    process.env.CAPSULES_PATH = path.join(root, 'capsules');
    process.env.EVENTS_PATH = path.join(root, 'events');
    process.env.TASKS_PATH = path.join(root, 'tasks');
    process.env.DISTILL_JOBS_PATH = path.join(root, 'distill-jobs');

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
      id: 'gene_remote_client',
      category: 'feature',
      signals_match: ['remote-client', 'workspace-playbook'],
      preconditions: [],
      strategy: ['persist authoritative remote task data'],
      constraints: {}
    };

    const capsule: Capsule = {
      type: 'Capsule',
      schema_version: '1.5.0',
      id: 'capsule_remote_client',
      trigger: ['remote-client', 'workspace-playbook'],
      gene: gene.id,
      summary: 'Remote task API should drive MCP recommendations and resources.',
      confidence: 0.88,
      blast_radius: { files: 1, lines: 4 },
      outcome: { status: 'success', score: 0.9 },
      env_fingerprint: { platform: currentPlatform, arch: currentArch, node_version: process.version },
      metadata: { created_at: '2026-03-13T00:00:00.000Z', source: 'local', validated: true }
    };

    await evomap.addGene(gene);
    await evomap.addCapsule(capsule);

    server = createHttpServer({
      mappingProxy: {
        getStatus: async () => ({
          id: 'cloud_mapping',
          enabled: true,
          state: 'ready',
          capabilities: { mcp: ['mapping_get_status', 'mapping_query_candidates'], http: ['/api/v1/mapping'] },
          upstream: { status: 'ok', port: 18110 }
        }),
        ingestProfiles: async () => ({ ingested: 1, table_profile_ids: [1] }),
        queryCandidates: async () => ({ initial_candidate_count: 8, candidates: [] })
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (originalEnv.GENES_PATH === undefined) delete process.env.GENES_PATH;
    else process.env.GENES_PATH = originalEnv.GENES_PATH;
    if (originalEnv.CAPSULES_PATH === undefined) delete process.env.CAPSULES_PATH;
    else process.env.CAPSULES_PATH = originalEnv.CAPSULES_PATH;
    if (originalEnv.EVENTS_PATH === undefined) delete process.env.EVENTS_PATH;
    else process.env.EVENTS_PATH = originalEnv.EVENTS_PATH;
    if (originalEnv.TASKS_PATH === undefined) delete process.env.TASKS_PATH;
    else process.env.TASKS_PATH = originalEnv.TASKS_PATH;
    if (originalEnv.DISTILL_JOBS_PATH === undefined) delete process.env.DISTILL_JOBS_PATH;
    else process.env.DISTILL_JOBS_PATH = originalEnv.DISTILL_JOBS_PATH;
    await fs.rm(root, { recursive: true, force: true });
  });

  test('runs the remote task lifecycle and reads workspace resources from the server', async () => {
    const client = new RemoteEvolutionClient({
      serverUrl: `http://127.0.0.1:${port}`,
      apiKey: 'test-api-key'
    });

    const started = await client.startTask({
      goal: 'drive MCP through authoritative remote APIs',
      workspace: 'capability',
      client: 'codex',
      initialSignals: ['remote-client', 'workspace-playbook']
    });

    expect(started.recommendedGenes.map((item: Gene) => item.id)).toContain('gene_remote_client');
    expect(started.recommendedCapsules.map((item: Capsule) => item.id)).toContain('capsule_remote_client');

    await client.recordUsage({
      taskId: started.taskId,
      knowledge: [
        { kind: 'gene', id: 'gene_remote_client', phase: 'plan' },
        { kind: 'capsule', id: 'capsule_remote_client', phase: 'implement' }
      ]
    });

    const context = await client.getTaskContext({ taskId: started.taskId });
    expect(context.knowledgeUsed).toHaveLength(2);

    await client.finalizeTask({
      taskId: started.taskId,
      summary: 'Remote lifecycle completed through HTTP APIs.',
      outcome: { status: 'success', score: 0.93 },
      retrospective: {
        signals: ['remote-client', 'workspace-playbook'],
        selfMistakes: [],
        userCorrections: [],
        validations: [{ command: 'npm run build', passed: true }]
      },
      createCapsule: false
    });

    const playbook = await client.getWorkspacePlaybook('capability');
    const recentSuccesses = await client.getWorkspaceRecentSuccesses('capability');

    expect(playbook.workspace).toBe('capability');
    expect(playbook.recommendedGenes).toContain('gene_remote_client');
    expect(playbook.recentCapsules).toContain('capsule_remote_client');
    expect(recentSuccesses.workspace).toBe('capability');
    expect(recentSuccesses.summaries).toContain('Remote lifecycle completed through HTTP APIs.');
  });

  test('reads mapping status and candidate queries through unified LocalEvomap endpoints', async () => {
    const client = new RemoteEvolutionClient({
      serverUrl: `http://127.0.0.1:${port}`,
      apiKey: 'test-api-key'
    });

    const status = await client.getMappingStatus();
    const result = await client.queryMappingCandidates({
      query_profile: { kind: 'xlsx', logical_name: 'CommercialWorkbook' },
      limit: 3
    });

    expect(status.id).toBe('cloud_mapping');
    expect(status.capabilities.mcp).toContain('mapping_query_candidates');
    expect(result).toHaveProperty('initial_candidate_count');
  });
});
