import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { LocalEvomap, DEFAULT_CONFIG } from '../index';
import { TaskSessionStore } from '../storage/task-session-store';
import { EvolutionService } from './evolution-service';
import type { Capsule, Gene } from '../types/gene-capsule-schema';

describe('EvolutionService', () => {
  const currentPlatform = (['linux', 'darwin', 'win32'].includes(process.platform) ? process.platform : 'linux') as 'linux' | 'darwin' | 'win32';
  const currentArch = (['x64', 'arm64', 'ia32'].includes(process.arch) ? process.arch : 'x64') as 'x64' | 'arm64' | 'ia32';

  async function createTempRoot(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), 'localevomap-evolution-service-'));
  }

  async function createService() {
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

    const service = new EvolutionService({ evomap, taskStore });
    return { service, evomap };
  }

  afterEach(async () => {
    const tmpRoot = os.tmpdir();
    const entries = await fs.readdir(tmpRoot, { withFileTypes: true });
    await Promise.all(entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('localevomap-evolution-service-'))
      .map(entry => fs.rm(path.join(tmpRoot, entry.name), { recursive: true, force: true })));
  });

  test('startTask returns task context with matched knowledge recommendations', async () => {
    const { service, evomap } = await createService();

    const gene: Gene = {
      type: 'Gene',
      id: 'gene_mcp_feature',
      category: 'feature',
      signals_match: ['mcp', 'task-session'],
      preconditions: [],
      strategy: ['start a task session', 'record used knowledge'],
      constraints: {}
    };

    const capsule: Capsule = {
      type: 'Capsule',
      schema_version: '1.5.0',
      id: 'capsule_mcp_success',
      trigger: ['mcp', 'task-session'],
      gene: gene.id,
      summary: 'Use a task-centered MCP flow instead of direct HTTP helpers.',
      confidence: 0.86,
      blast_radius: { files: 2, lines: 20 },
      outcome: { status: 'success', score: 0.9 },
      env_fingerprint: { platform: currentPlatform, arch: currentArch, node_version: process.version },
      metadata: { created_at: '2026-03-10T00:00:00.000Z', source: 'local', validated: true }
    };

    await evomap.addGene(gene);
    await evomap.addCapsule(capsule);

    const started = await service.startTask({
      goal: 'replace agent HTTP path with MCP tools',
      workspace: 'capability',
      client: 'codex',
      initialSignals: ['mcp', 'task-session']
    });

    expect(started.taskId).toMatch(/^task_/);
    expect(started.recommendedGenes.map((item: Gene) => item.id)).toContain(gene.id);
    expect(started.recommendedCapsules.map((item: Capsule) => item.id)).toContain(capsule.id);
    expect(started.workingHints.length).toBeGreaterThan(0);
  });

  test('finalizeTask marks recorded provenance when a gene usage ref exists', async () => {
    const { service, evomap } = await createService();

    const gene: Gene = {
      type: 'Gene',
      id: 'gene_task_finalize',
      category: 'feature',
      signals_match: ['mcp', 'task-complete'],
      preconditions: [],
      strategy: ['finalize the task', 'submit retrospective feedback'],
      constraints: {}
    };

    const capsule: Capsule = {
      type: 'Capsule',
      schema_version: '1.5.0',
      id: 'capsule_task_finalize',
      trigger: ['mcp', 'task-complete'],
      gene: gene.id,
      summary: 'Finalize through a task-centered evolution path.',
      confidence: 0.82,
      blast_radius: { files: 1, lines: 8 },
      outcome: { status: 'success', score: 0.82 },
      env_fingerprint: { platform: currentPlatform, arch: currentArch, node_version: process.version },
      metadata: { created_at: '2026-03-10T00:00:00.000Z', source: 'local', validated: true }
    };

    await evomap.addGene(gene);
    await evomap.addCapsule(capsule);

    const started = await service.startTask({
      goal: 'ship MCP-first evolution',
      workspace: 'capability',
      client: 'codex',
      initialSignals: ['mcp', 'task-complete']
    });

    await service.recordUsage({
      taskId: started.taskId,
      knowledge: [
        { kind: 'gene', id: gene.id, phase: 'implement', note: 'used for workflow shape' },
        { kind: 'capsule', id: capsule.id, phase: 'implement', note: 'reused the proven finalize pattern' }
      ]
    });

    const result = await service.finalizeTask({
      taskId: started.taskId,
      summary: 'MCP flow replaced the direct HTTP helper path.',
      outcome: { status: 'success', score: 0.93 },
      retrospective: {
        signals: ['mcp', 'task-complete'],
        selfMistakes: ['Initially kept one compatibility helper'],
        userCorrections: ['User asked for a clean MCP-only design'],
        validations: [{ command: 'npm run build', passed: true }]
      },
      createCapsule: true
    });

    expect(result.eventId).toMatch(/^feedback_/);
    expect(result.genesUpdated).toContain(gene.id);
    expect(result.capsulesUpdated).toContain(capsule.id);
    expect(result.distillReady).toBe(false);
    expect(result.knowledgeStatus).toBe('recorded');
    expect(result.warnings).toEqual([]);

    const context = await service.getTaskContext({ taskId: started.taskId });
    expect(context.task.status).toBe('finalized');
    expect(context.task.outcome).toEqual({ status: 'success', score: 0.93 });
    expect(context.task.finalization?.knowledgeStatus).toBe('recorded');
    expect(context.task.finalization?.warnings).toEqual([]);

    const events = await evomap.getRecentEvents(10);
    expect(events.some(event => event.id === result.eventId && event.knowledge_status === 'recorded')).toBe(true);
  });

  test('finalizeTask marks capsule_only provenance when only a capsule usage ref exists', async () => {
    const { service, evomap } = await createService();

    const gene: Gene = {
      type: 'Gene',
      id: 'gene_capsule_only',
      category: 'feature',
      signals_match: ['capsule-only'],
      preconditions: [],
      strategy: ['reuse capsule only'],
      constraints: {}
    };

    const capsule: Capsule = {
      type: 'Capsule',
      schema_version: '1.5.0',
      id: 'capsule_capsule_only',
      trigger: ['capsule-only'],
      gene: gene.id,
      summary: 'Capsule-only provenance path.',
      confidence: 0.79,
      blast_radius: { files: 1, lines: 4 },
      outcome: { status: 'success', score: 0.79 },
      env_fingerprint: { platform: currentPlatform, arch: currentArch, node_version: process.version },
      metadata: { created_at: '2026-03-10T00:00:00.000Z', source: 'local', validated: true }
    };

    await evomap.addGene(gene);
    await evomap.addCapsule(capsule);

    const started = await service.startTask({
      goal: 'verify capsule-only finalize path',
      workspace: 'capability',
      client: 'codex',
      initialSignals: ['capsule-only']
    });

    await service.recordUsage({
      taskId: started.taskId,
      knowledge: [
        { kind: 'capsule', id: capsule.id, phase: 'implement', note: 'used capsule without explicit gene record' }
      ]
    });

    const result = await service.finalizeTask({
      taskId: started.taskId,
      summary: 'Finished with only a capsule usage record.',
      outcome: { status: 'success', score: 0.81 },
      retrospective: {
        signals: ['capsule-only'],
        selfMistakes: [],
        userCorrections: [],
        validations: [{ command: 'npm test', passed: true }]
      },
      createCapsule: false
    });

    expect(result.knowledgeStatus).toBe('capsule_only');
    expect(result.warnings).toEqual([]);

    const events = await evomap.getRecentEvents(10);
    expect(events[0]?.selected_gene).toBeNull();
    expect(events[0]?.used_capsule).toBe(capsule.id);
    expect(events[0]?.knowledge_status).toBe('capsule_only');
  });

  test('finalizeTask marks no_knowledge_used provenance and warning when nothing was recorded', async () => {
    const { service, evomap } = await createService();

    const started = await service.startTask({
      goal: 'verify no knowledge path',
      workspace: 'capability',
      client: 'codex',
      initialSignals: ['no-knowledge']
    });

    const result = await service.finalizeTask({
      taskId: started.taskId,
      summary: 'Completed without recorded LocalEvomap knowledge.',
      outcome: { status: 'success', score: 0.74 },
      retrospective: {
        signals: ['no-knowledge'],
        selfMistakes: [],
        userCorrections: [],
        validations: [{ command: 'npm run build', passed: true }]
      },
      createCapsule: false
    });

    expect(result.knowledgeStatus).toBe('no_knowledge_used');
    expect(result.warnings).toContain('Task finalized without recorded gene/capsule usage');

    const context = await service.getTaskContext({ taskId: started.taskId });
    expect(context.task.finalization?.knowledgeStatus).toBe('no_knowledge_used');
    expect(context.task.finalization?.warnings).toContain('Task finalized without recorded gene/capsule usage');

    const events = await evomap.getRecentEvents(10);
    expect(events[0]?.selected_gene).toBeNull();
    expect(events[0]?.knowledge_status).toBe('no_knowledge_used');
  });
});
