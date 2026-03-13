import * as fs from 'fs/promises';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { LocalEvomap, DEFAULT_CONFIG } from '../index';
import { createHttpServer } from '../server';
import { LLMProvider } from '../core/llm-provider';
import { DistillJobStore } from '../storage/distill-job-store';
import type { Capsule, Gene } from '../types/gene-capsule-schema';

function requestJson(
  port: number,
  method: string,
  pathname: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<{ statusCode: number; payload: any }> {
  return new Promise((resolve, reject) => {
    const serialized = body ? JSON.stringify(body) : undefined;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers: {
        ...(serialized
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(serialized).toString() }
          : {}),
        ...(headers || {})
      },
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve({
          statusCode: res.statusCode ?? 0,
          payload: text ? JSON.parse(text) : null,
        });
      });
    });

    req.on('error', reject);
    if (serialized) req.write(serialized);
    req.end();
  });
}

describe('agent bootstrap endpoints', () => {
  let server: http.Server;
  let port: number;
  let root: string;
  const authHeaders = { Authorization: 'Bearer test-api-key' };
  const currentPlatform = (['linux', 'darwin', 'win32'].includes(process.platform) ? process.platform : 'linux') as 'linux' | 'darwin' | 'win32';
  const currentArch = (['x64', 'arm64', 'ia32'].includes(process.arch) ? process.arch : 'x64') as 'x64' | 'arm64' | 'ia32';
  const originalEnv = {
    GENES_PATH: process.env.GENES_PATH,
    CAPSULES_PATH: process.env.CAPSULES_PATH,
    EVENTS_PATH: process.env.EVENTS_PATH,
    TASKS_PATH: process.env.TASKS_PATH,
    DISTILL_JOBS_PATH: process.env.DISTILL_JOBS_PATH,
    EVOMAP_LLM_PROVIDER: process.env.EVOMAP_LLM_PROVIDER,
    EVOMAP_LLM_MODEL: process.env.EVOMAP_LLM_MODEL,
    LLM_API_KEY: process.env.LLM_API_KEY,
    LOCAL_LLM_BASE_URL: process.env.LOCAL_LLM_BASE_URL,
  };

  async function seedDistillReadyKnowledge(seedId: string): Promise<void> {
    const evomap = new LocalEvomap({
      ...DEFAULT_CONFIG,
      genes_path: process.env.GENES_PATH!,
      capsules_path: process.env.CAPSULES_PATH!,
      events_path: process.env.EVENTS_PATH!,
      review_mode: false
    });
    await evomap.init();

    const gene: Gene = {
      type: 'Gene',
      id: `gene_${seedId}`,
      category: 'repair',
      signals_match: ['remote-evolution', 'distill'],
      preconditions: [],
      strategy: ['record server-side evolution', 'distill successful patterns'],
      constraints: { max_files: 12, forbidden_paths: ['.git', 'node_modules'] }
    };

    await evomap.addGene(gene);

    const baseTime = Date.UTC(2026, 2, 13, 9, 0, 0);
    for (let index = 0; index < 10; index++) {
      const capsule: Capsule = {
        type: 'Capsule',
        schema_version: '1.5.0',
        id: `capsule_${seedId}_${index}`,
        trigger: ['remote-evolution', `signal-${index}`],
        gene: gene.id,
        summary: `Successful remote evolution ${index}`,
        confidence: 0.8,
        blast_radius: { files: 1, lines: 5 },
        outcome: { status: 'success', score: 0.8 },
        env_fingerprint: { platform: currentPlatform, arch: currentArch, node_version: process.version },
        metadata: { created_at: new Date(baseTime + index * 1000).toISOString(), source: 'local', validated: true }
      };

      await evomap.addCapsule(capsule);
    }
  }

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'localevomap-agent-endpoints-'));
    process.env.GENES_PATH = path.join(root, 'genes');
    process.env.CAPSULES_PATH = path.join(root, 'capsules');
    process.env.EVENTS_PATH = path.join(root, 'events');
    process.env.TASKS_PATH = path.join(root, 'tasks');
    process.env.DISTILL_JOBS_PATH = path.join(root, 'distill-jobs');
    delete process.env.EVOMAP_LLM_PROVIDER;
    delete process.env.EVOMAP_LLM_MODEL;
    delete process.env.LLM_API_KEY;
    delete process.env.LOCAL_LLM_BASE_URL;

    server = createHttpServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(() => {
    jest.restoreAllMocks();

    if (originalEnv.EVOMAP_LLM_PROVIDER === undefined) delete process.env.EVOMAP_LLM_PROVIDER;
    else process.env.EVOMAP_LLM_PROVIDER = originalEnv.EVOMAP_LLM_PROVIDER;

    if (originalEnv.EVOMAP_LLM_MODEL === undefined) delete process.env.EVOMAP_LLM_MODEL;
    else process.env.EVOMAP_LLM_MODEL = originalEnv.EVOMAP_LLM_MODEL;

    if (originalEnv.LLM_API_KEY === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = originalEnv.LLM_API_KEY;

    if (originalEnv.LOCAL_LLM_BASE_URL === undefined) delete process.env.LOCAL_LLM_BASE_URL;
    else process.env.LOCAL_LLM_BASE_URL = originalEnv.LOCAL_LLM_BASE_URL;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await fs.rm(root, { recursive: true, force: true });
    process.env.GENES_PATH = originalEnv.GENES_PATH;
    process.env.CAPSULES_PATH = originalEnv.CAPSULES_PATH;
    process.env.EVENTS_PATH = originalEnv.EVENTS_PATH;
    process.env.TASKS_PATH = originalEnv.TASKS_PATH;
    process.env.DISTILL_JOBS_PATH = originalEnv.DISTILL_JOBS_PATH;
    if (originalEnv.EVOMAP_LLM_PROVIDER === undefined) delete process.env.EVOMAP_LLM_PROVIDER;
    else process.env.EVOMAP_LLM_PROVIDER = originalEnv.EVOMAP_LLM_PROVIDER;
    if (originalEnv.EVOMAP_LLM_MODEL === undefined) delete process.env.EVOMAP_LLM_MODEL;
    else process.env.EVOMAP_LLM_MODEL = originalEnv.EVOMAP_LLM_MODEL;
    if (originalEnv.LLM_API_KEY === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = originalEnv.LLM_API_KEY;
    if (originalEnv.LOCAL_LLM_BASE_URL === undefined) delete process.env.LOCAL_LLM_BASE_URL;
    else process.env.LOCAL_LLM_BASE_URL = originalEnv.LOCAL_LLM_BASE_URL;
  });

  test('serves the checked-in agent manifest', async () => {
    const response = await requestJson(port, 'GET', '/api/v1/agent-manifest');

    expect(response.statusCode).toBe(200);
    expect(response.payload.manifest_version).toBeTruthy();
    expect(response.payload.mcp.runtime.hash).toMatch(/^sha256-/);
    expect(response.payload.skills.cursor.download_url).toBe('/skill/cursor');
  });

  test('serves the agent bootstrap checklist for all supported clients', async () => {
    const response = await requestJson(port, 'GET', '/api/v1/agent/bootstrap');

    expect(response.statusCode).toBe(200);
    expect(response.payload.project.preferred_runtime).toBe('local-mcp');
    expect(response.payload.clients.codex.mcp_config.server_name).toBe('local-evomap');
    expect(response.payload.clients.cursor.automation_level).toBe('full');
    expect(response.payload.clients.kimi.automation_level).toBe('partial');
  });

  test('filters the agent bootstrap checklist by client', async () => {
    const response = await requestJson(port, 'GET', '/api/v1/agent/bootstrap?client=codex');

    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.payload.clients)).toEqual(['codex']);
    expect(response.payload.clients.codex.mcp_config.config_path).toBe('~/.codex/config.toml');
  });

  test('reports blocked when a breaking skill is outdated', async () => {
    const manifestResponse = await requestJson(port, 'GET', '/api/v1/agent-manifest');
    const manifest = manifestResponse.payload;

    const response = await requestJson(port, 'POST', '/api/v1/agent/check', {
      client: 'codex',
      manifest_version_seen: manifest.manifest_version,
      mcp_version: manifest.mcp.runtime.version,
      mcp_hash: manifest.mcp.runtime.hash,
      skill_version: '0.0.1',
      skill_hash: 'sha256-old',
    });

    expect(response.statusCode).toBe(200);
    expect(response.payload.status).toBe('blocked');
    expect(response.payload.blocking).toBe(true);
  });

  test('creates a remote task session with MCP-compatible response fields', async () => {
    const response = await requestJson(port, 'POST', '/api/v1/tasks', {
      goal: 'ship remote evolution',
      workspace: 'capability',
      client: 'codex',
      initialSignals: ['remote-evolution', 'task-api']
    }, authHeaders);

    expect(response.statusCode).toBe(200);
    expect(response.payload.taskId).toMatch(/^task_/);
    expect(Array.isArray(response.payload.recommendedGenes)).toBe(true);
    expect(Array.isArray(response.payload.recommendedCapsules)).toBe(true);
    expect(Array.isArray(response.payload.workingHints)).toBe(true);
  });

  test('finalizes a remote task and persists an authoritative event', async () => {
    const started = await requestJson(port, 'POST', '/api/v1/tasks', {
      goal: 'close remote evolution loop',
      workspace: 'capability',
      client: 'codex',
      initialSignals: ['remote-evolution', 'finalize']
    }, authHeaders);

    expect(started.statusCode).toBe(200);

    const finalized = await requestJson(port, 'POST', `/api/v1/tasks/${started.payload.taskId}/finalize`, {
      summary: 'Finalized through the remote task API.',
      outcome: { status: 'success', score: 0.91 },
      retrospective: {
        signals: ['remote-evolution', 'finalize'],
        selfMistakes: [],
        userCorrections: [],
        validations: [{ command: 'npm run build', passed: true }]
      },
      createCapsule: false
    }, authHeaders);

    const events = await requestJson(port, 'GET', '/api/v1/events?limit=20');

    expect(finalized.statusCode).toBe(200);
    expect(finalized.payload.eventId).toMatch(/^feedback_/);
    expect(events.payload.events.some((event: { id: string }) => event.id === finalized.payload.eventId)).toBe(true);
  });

  test('keeps finalize successful even when automatic distillation fails', async () => {
    await seedDistillReadyKnowledge('distill_failure');

    const started = await requestJson(port, 'POST', '/api/v1/tasks', {
      goal: 'trigger automatic distillation failure path',
      workspace: 'capability',
      client: 'codex',
      initialSignals: ['remote-evolution', 'distill']
    }, authHeaders);

    const finalized = await requestJson(port, 'POST', `/api/v1/tasks/${started.payload.taskId}/finalize`, {
      summary: 'Finalize should remain successful when automatic distillation cannot run.',
      outcome: { status: 'success', score: 0.93 },
      retrospective: {
        signals: ['remote-evolution', 'distill'],
        selfMistakes: [],
        userCorrections: [],
        validations: [{ command: 'npm run build', passed: true }]
      },
      createCapsule: false
    }, authHeaders);

    expect(finalized.statusCode).toBe(200);
    expect(finalized.payload.eventId).toMatch(/^feedback_/);
    expect(finalized.payload.distillReady).toBe(true);
    expect(finalized.payload.distillJobId).toMatch(/^distill_/);
    expect(finalized.payload.distillStatus).toBe('failed');
  });

  test('automatically completes distillation and persists the distilled gene when LLM synthesis succeeds', async () => {
    await seedDistillReadyKnowledge('distill_success');

    process.env.EVOMAP_LLM_PROVIDER = 'local';
    process.env.EVOMAP_LLM_MODEL = 'mock-model';
    process.env.LLM_API_KEY = 'mock-key';
    process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:65535/v1';

    jest.spyOn(LLMProvider.prototype, 'generateText').mockResolvedValue({
      text: JSON.stringify({
        type: 'Gene',
        id: 'gene_distilled_remote_success',
        category: 'repair',
        signals_match: ['server-authoritative-distill', 'distill-job-success'],
        preconditions: [],
        strategy: ['capture successful remote task patterns'],
        constraints: { max_files: 12, forbidden_paths: ['.git', 'node_modules'] },
        validation: ['npm run build'],
        metadata: { description: 'Distilled from remote evolution successes' }
      })
    });

    const started = await requestJson(port, 'POST', '/api/v1/tasks', {
      goal: 'trigger automatic distillation success path',
      workspace: 'capability',
      client: 'codex',
      initialSignals: ['remote-evolution', 'distill']
    }, authHeaders);

    const finalized = await requestJson(port, 'POST', `/api/v1/tasks/${started.payload.taskId}/finalize`, {
      summary: 'Finalize should automatically distill a new gene when the LLM succeeds.',
      outcome: { status: 'success', score: 0.95 },
      retrospective: {
        signals: ['remote-evolution', 'distill'],
        selfMistakes: [],
        userCorrections: [],
        validations: [{ command: 'npm run build', passed: true }]
      },
      createCapsule: false
    }, authHeaders);

    const genes = await requestJson(port, 'GET', '/api/v1/genes?q=gene_distilled_remote_success');

    expect(finalized.statusCode).toBe(200);
    expect(finalized.payload.distillReady).toBe(true);
    expect(finalized.payload.distillJobId).toMatch(/^distill_/);
    expect(finalized.payload.distillStatus).toBe('succeeded');
    expect(genes.payload.genes.some((gene: { id: string }) => gene.id === 'gene_distilled_remote_success')).toBe(true);
  });


  test('lists persisted distill jobs', async () => {
    const store = new DistillJobStore(process.env.DISTILL_JOBS_PATH!);
    await store.init();
    const job = await store.createPending({
      fingerprint: 'jobs:list',
      sourceCapsuleIds: ['capsule_list_a', 'capsule_list_b']
    });

    const jobs = await requestJson(port, 'GET', '/api/v1/distill/jobs', undefined, authHeaders);

    expect(jobs.statusCode).toBe(200);
    expect(Array.isArray(jobs.payload.jobs)).toBe(true);
    expect(jobs.payload.jobs.some((item: { jobId: string }) => item.jobId === job.jobId)).toBe(true);
  });

  test('returns the persisted distill job detail', async () => {
    const store = new DistillJobStore(process.env.DISTILL_JOBS_PATH!);
    await store.init();
    const job = await store.createPending({
      fingerprint: 'jobs:detail',
      sourceCapsuleIds: ['capsule_detail_a', 'capsule_detail_b']
    });

    const detail = await requestJson(port, 'GET', `/api/v1/distill/jobs/${job.jobId}`, undefined, authHeaders);

    expect(detail.statusCode).toBe(200);
    expect(detail.payload.jobId).toBe(job.jobId);
    expect(Array.isArray(detail.payload.sourceCapsuleIds)).toBe(true);
    expect(detail.payload.status).toBe('pending');
  });
});
