import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { LocalEvomap, DEFAULT_CONFIG } from './index';
import type { Capsule, Gene } from './core/types/gene-capsule-schema';

describe('LocalEvomap feedback', () => {
  async function createTempRoot(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), 'localevomap-feedback-'));
  }

  async function createEvomap() {
    const root = await createTempRoot();
    const evomap = new LocalEvomap({
      ...DEFAULT_CONFIG,
      genes_path: path.join(root, 'genes'),
      capsules_path: path.join(root, 'capsules'),
      events_path: path.join(root, 'events'),
      review_mode: false
    });

    await evomap.init();
    return { evomap, root };
  }

  afterEach(async () => {
    const tmpRoot = path.join(os.tmpdir());
    const entries = await fs.readdir(tmpRoot, { withFileTypes: true });
    await Promise.all(entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('localevomap-feedback-'))
      .map(entry => fs.rm(path.join(tmpRoot, entry.name), { recursive: true, force: true })));
  });

  test('submitFeedback should record event, update reused knowledge, and create a new capsule', async () => {
    const { evomap } = await createEvomap();

    const gene: Gene = {
      type: 'Gene',
      id: 'gene_feedback_repair',
      category: 'repair',
      signals_match: ['error_type', 'TypeError'],
      preconditions: [],
      strategy: ['trace root cause', 'fix minimal surface'],
      constraints: { max_files: 5, max_lines: 50 }
    };

    const capsule: Capsule = {
      type: 'Capsule',
      schema_version: '1.5.0',
      id: 'capsule_existing_fix',
      trigger: ['TypeError', 'undefined'],
      gene: gene.id,
      summary: 'Existing guard-based fix',
      confidence: 0.8,
      blast_radius: { files: 1, lines: 5 },
      outcome: { status: 'success', score: 0.8 },
      env_fingerprint: { platform: 'win32', arch: 'x64' },
      metadata: { created_at: '2026-03-10T00:00:00.000Z', source: 'local', validated: true }
    };

    await evomap.addGene(gene);
    await evomap.addCapsule(capsule);

    const result = await evomap.submitFeedback({
      signals: ['TypeError', 'undefined', 'user_bug_report'],
      selected_gene: gene.id,
      used_capsule: capsule.id,
      summary: 'Task-end retrospective: reused the guard capsule, fixed a missed null path, and aligned with the user correction.',
      self_mistakes: ['Missed the null path in the first patch'],
      user_corrections: ['User pointed out the failing undefined branch'],
      outcome: { status: 'success', score: 0.93 },
      validation: { passed: true, commands_run: 2, errors: [] },
      create_capsule: true
    });

    expect(result.event_id).toMatch(/^feedback_/);
    expect(result.gene_updated).toBe(true);
    expect(result.capsule_updated).toBe(true);
    expect(result.capsule_id).toMatch(/^feedback_capsule_/);
    expect(result.distill_ready).toBe(false);

    const updatedGene = await evomap.getGeneById(gene.id);
    expect(updatedGene?.epigenetic_marks).toHaveLength(1);
    expect(updatedGene?.epigenetic_marks?.[0].outcome).toBe('success');

    const updatedCapsule = await evomap.getCapsuleById(capsule.id);
    expect(updatedCapsule?.confidence).toBeGreaterThan(0.8);
    expect(updatedCapsule?.metadata?.applied_at).toBeTruthy();

    const capsules = await evomap.getAllCapsules();
    expect(capsules.some(item => item.id === result.capsule_id)).toBe(true);

    const events = await evomap.getRecentEvents(10);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      id: result.event_id,
      selected_gene: gene.id,
      used_capsule: capsule.id,
      knowledge_status: 'recorded',
      outcome: expect.objectContaining({ status: 'success', score: 0.93 })
    }));
    expect(events[0].metadata?.feedback).toEqual(expect.objectContaining({
      self_mistakes: ['Missed the null path in the first patch'],
      user_corrections: ['User pointed out the failing undefined branch']
    }));
  });

  test('submitFeedback should skip capsule creation when create_capsule is false', async () => {
    const { evomap } = await createEvomap();

    await evomap.addGene({
      type: 'Gene',
      id: 'gene_feedback_analysis',
      category: 'analysis',
      signals_match: ['analysis'],
      preconditions: [],
      strategy: ['summarize mistakes'],
      constraints: {}
    });

    const result = await evomap.submitFeedback({
      signals: ['analysis'],
      selected_gene: 'gene_feedback_analysis',
      summary: 'Summarized the task with no reusable implementation artifact.',
      outcome: { status: 'partial', score: 0.6 },
      create_capsule: false
    });

    expect(result.capsule_id).toBeNull();

    const capsules = await evomap.getAllCapsules();
    expect(capsules).toHaveLength(0);
  });

  test('submitFeedback should keep legacy inference available when requested implicitly', async () => {
    const { evomap } = await createEvomap();

    await evomap.addGene({
      type: 'Gene',
      id: 'gene_feedback_inferred',
      category: 'repair',
      signals_match: ['mkdir', '-p', 'Windows'],
      preconditions: [],
      strategy: ['use New-Item -Force'],
      constraints: {}
    });

    const result = await evomap.submitFeedback({
      signals: ['mkdir', '-p', 'Windows'],
      summary: 'Recovered the correct command without explicitly selecting a gene.',
      outcome: { status: 'success', score: 0.88 },
      create_capsule: true
    });

    const createdCapsule = await evomap.getCapsuleById(result.capsule_id!);
    expect(createdCapsule?.gene).toBe('gene_feedback_inferred');

    const events = await evomap.getRecentEvents(10);
    expect(events[0]?.selected_gene).toBe('gene_feedback_inferred');
    expect(events[0]?.knowledge_status).toBe('inferred_legacy');
  });

  test('submitFeedback should write no_knowledge_used when explicitly told no knowledge was recorded', async () => {
    const { evomap } = await createEvomap();

    const result = await evomap.submitFeedback({
      signals: ['plain-task'],
      summary: 'Completed work without using LocalEvomap knowledge.',
      outcome: { status: 'success', score: 0.71 },
      create_capsule: false,
      knowledge_status: 'no_knowledge_used'
    });

    const events = await evomap.getRecentEvents(10);
    expect(events[0]).toEqual(expect.objectContaining({
      id: result.event_id,
      selected_gene: null,
      knowledge_status: 'no_knowledge_used'
    }));
  });

  test('submitFeedback should write capsule_only when only a capsule is supplied', async () => {
    const { evomap } = await createEvomap();

    const gene: Gene = {
      type: 'Gene',
      id: 'gene_capsule_only_feedback',
      category: 'feature',
      signals_match: ['capsule-only'],
      preconditions: [],
      strategy: ['replay capsule'],
      constraints: {}
    };

    const capsule: Capsule = {
      type: 'Capsule',
      schema_version: '1.5.0',
      id: 'capsule_only_feedback',
      trigger: ['capsule-only'],
      gene: gene.id,
      summary: 'Capsule-only feedback case',
      confidence: 0.77,
      blast_radius: { files: 1, lines: 3 },
      outcome: { status: 'success', score: 0.77 },
      env_fingerprint: { platform: 'win32', arch: 'x64' },
      metadata: { created_at: '2026-03-10T00:00:00.000Z', source: 'local', validated: true }
    };

    await evomap.addGene(gene);
    await evomap.addCapsule(capsule);

    await evomap.submitFeedback({
      signals: ['capsule-only'],
      used_capsule: capsule.id,
      summary: 'Used a capsule without recording the gene separately.',
      outcome: { status: 'success', score: 0.83 },
      create_capsule: false,
      knowledge_status: 'capsule_only'
    });

    const events = await evomap.getRecentEvents(10);
    expect(events[0]?.selected_gene).toBeNull();
    expect(events[0]?.used_capsule).toBe(capsule.id);
    expect(events[0]?.knowledge_status).toBe('capsule_only');
  });
});
