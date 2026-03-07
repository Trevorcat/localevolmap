import {
  analyzePatterns,
  collectDistillationData,
  completeDistillation,
  extractJsonFromResponse,
  resetDistillationState,
  shouldDistill,
  type DistillationState
} from './skill-distiller';
import type { Capsule, Gene } from '../types/gene-capsule-schema';

const createCapsule = (id: string, gene: string, trigger: string[], createdAt: string, status: Capsule['outcome']['status'] = 'success'): Capsule => ({
  type: 'Capsule',
  schema_version: '1.0.0',
  id,
  trigger,
  gene,
  summary: id,
  confidence: 0.8,
  blast_radius: { files: 1, lines: 10 },
  outcome: { status, score: status === 'success' ? 0.8 : 0.1 },
  env_fingerprint: { platform: 'linux', arch: 'x64' },
  metadata: { created_at: createdAt, source: 'local', validated: true }
});

const existingGenes: Gene[] = [
  {
    type: 'Gene',
    id: 'gene_existing',
    category: 'repair',
    signals_match: ['error'],
    preconditions: [],
    strategy: ['fix'],
    constraints: { forbidden_paths: ['.git', 'node_modules'] }
  }
];

describe('skill-distiller', () => {
  test('uses per-instance distillation state', () => {
    const now = Date.UTC(2026, 2, 7, 0, 0, 0);
    const stateA: DistillationState = { lastDistillationTime: 0 };
    const stateB: DistillationState = { lastDistillationTime: now };
    const capsules = Array.from({ length: 10 }, (_, index) =>
      createCapsule(`c${index}`, 'gene_a', ['error_timeout'], new Date(now - index * 1000).toISOString())
    );

    resetDistillationState(stateA);
    expect(shouldDistill(capsules, stateA, now)).toBe(true);
    expect(shouldDistill(capsules, stateB, now)).toBe(false);
  });

  test('detects strategy drift using sorted capsules and coverage gaps via matcher', () => {
    const capsules = [
      createCapsule('c1', 'gene_a', ['error_timeout'], '2026-03-07T00:00:00.000Z'),
      createCapsule('c2', 'gene_a', ['perf_critical'], '2026-03-07T00:01:00.000Z'),
      createCapsule('c3', 'gene_a', ['perf_critical'], '2026-03-07T00:02:00.000Z'),
      createCapsule('c4', 'gene_a', ['perf_critical'], '2026-03-07T00:03:00.000Z'),
      createCapsule('c5', 'gene_a', ['perf_critical'], '2026-03-07T00:04:00.000Z')
    ];

    const data = collectDistillationData(capsules);
    const analysis = analyzePatterns(data, existingGenes);
    expect(analysis.strategyDrifts.some(item => item.geneId === 'gene_a')).toBe(true);
    expect(analysis.coverageGaps).toContain('perf_critical');
    expect(analysis.coverageGaps).not.toContain('error_timeout');
  });

  test('rejects synthesized genes with empty structure', () => {
    const response = JSON.stringify({
      id: 'gene_distilled_empty',
      category: 'repair',
      signals_match: [],
      strategy: [],
      constraints: { max_files: 2, forbidden_paths: ['.git', 'node_modules'] }
    });

    const result = completeDistillation(response, existingGenes, []);
    expect(result.success).toBe(false);
    expect(result.error).toContain('signals_match must be a non-empty array');
    expect(result.error).toContain('strategy must be a non-empty array');
  });

  test('extracts JSON from markdown-wrapped LLM output', () => {
    const parsed = extractJsonFromResponse('```json\n{"id":"gene_distilled_ok"}\n```');
    expect(parsed.id).toBe('gene_distilled_ok');
  });
});
