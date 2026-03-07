import {
  applyEpigeneticMarks,
  getEpigeneticBoost,
  hashEnvFingerprint,
  pruneExpiredMarks,
  EPIGENETIC_MAX_MARKS_PER_ENV
} from './epigenetic';
import type { Gene } from '../types/gene-capsule-schema';

const baseGene = (): Gene => ({
  type: 'Gene',
  id: 'gene_test',
  category: 'repair',
  signals_match: ['log_error'],
  preconditions: [],
  strategy: ['fix'],
  constraints: {}
});

describe('epigenetic', () => {
  test('hash includes working_dir and git_branch distinctions', () => {
    const envA = { platform: 'linux', arch: 'x64', node_version: 'v22.0.0', working_dir: '/a', git_branch: 'main' } as const;
    const envB = { platform: 'linux', arch: 'x64', node_version: 'v22.0.0', working_dir: '/b', git_branch: 'main' } as const;
    const envC = { platform: 'linux', arch: 'x64', node_version: 'v22.0.0', working_dir: '/a', git_branch: 'feature' } as const;
    expect(hashEnvFingerprint(envA)).not.toBe(hashEnvFingerprint(envB));
    expect(hashEnvFingerprint(envA)).not.toBe(hashEnvFingerprint(envC));
  });

  test('keeps marks fairly per environment', () => {
    const gene = baseGene();
    const linuxEnv = { platform: 'linux', arch: 'x64', node_version: 'v22.0.0', working_dir: '/a' } as const;
    const winEnv = { platform: 'win32', arch: 'x64', node_version: 'v22.0.0', working_dir: 'C:/a' } as const;

    for (let index = 0; index < EPIGENETIC_MAX_MARKS_PER_ENV + 3; index++) {
      applyEpigeneticMarks(gene, linuxEnv, 'success');
      applyEpigeneticMarks(gene, winEnv, 'failed');
    }

    const envGroups = new Map<string, number>();
    gene.epigenetic_marks?.forEach(mark => {
      envGroups.set(mark.env_hash, (envGroups.get(mark.env_hash) || 0) + 1);
    });

    expect(Array.from(envGroups.values())).toEqual(
      expect.arrayContaining([EPIGENETIC_MAX_MARKS_PER_ENV, EPIGENETIC_MAX_MARKS_PER_ENV])
    );
  });

  test('prunes expired marks without removing fresh ones', () => {
    const gene = baseGene();
    gene.epigenetic_marks = [
      { env_hash: 'env_old', outcome: 'success', boost: 0.05, timestamp: '2025-01-01T00:00:00.000Z' },
      { env_hash: 'env_new', outcome: 'success', boost: 0.05, timestamp: new Date().toISOString() }
    ];

    pruneExpiredMarks(gene);
    expect(gene.epigenetic_marks).toHaveLength(1);
    expect(gene.epigenetic_marks?.[0].env_hash).toBe('env_new');
  });

  test('clamps boost within supported range', () => {
    const gene = baseGene();
    const env = { platform: 'linux', arch: 'x64', node_version: 'v22.0.0', working_dir: '/a' } as const;
    for (let index = 0; index < 20; index++) {
      applyEpigeneticMarks(gene, env, 'success');
    }
    expect(getEpigeneticBoost(gene, env)).toBeLessThanOrEqual(0.5);
  });
});
