import type { Capsule, Gene } from './types/gene-capsule-schema';
import { resolveCapsuleGene, resolveCapsuleGenes } from './capsule-gene-resolver';

const genes: Gene[] = [
  {
    type: 'Gene',
    id: 'gene_repair_build',
    category: 'repair',
    signals_match: ['build', 'compile', 'build failed'],
    preconditions: [],
    strategy: ['read build logs'],
    constraints: {}
  },
  {
    type: 'Gene',
    id: 'gene_windows_cmd',
    category: 'repair',
    signals_match: ['mkdir', '-p', 'Windows'],
    preconditions: [],
    strategy: ['use New-Item -Force'],
    constraints: {}
  }
];

function createCapsule(overrides: Partial<Capsule> = {}): Capsule {
  return {
    type: 'Capsule',
    schema_version: '1.0.0',
    id: 'cap_test',
    trigger: ['build-fail'],
    gene: 'unknown',
    summary: 'test capsule',
    confidence: 0.8,
    blast_radius: { files: 0, lines: 0 },
    outcome: { status: 'success', score: 0.8 },
    env_fingerprint: { platform: 'win32', arch: 'x64' },
    metadata: { created_at: '2026-03-11T00:00:00.000Z', source: 'local', validated: false },
    ...overrides
  };
}

describe('capsule gene resolver', () => {
  test('infers a gene for capsules whose gene is unknown', () => {
    const capsule = createCapsule({
      trigger: ['build-fail']
    });

    const resolved = resolveCapsuleGene(capsule, genes);

    expect(resolved.gene).toBe('gene_repair_build');
  });

  test('keeps an explicit non-unknown gene', () => {
    const capsule = createCapsule({
      gene: 'gene_windows_cmd',
      trigger: ['build-fail']
    });

    const resolved = resolveCapsuleGene(capsule, genes);

    expect(resolved.gene).toBe('gene_windows_cmd');
  });

  test('resolves multiple capsules consistently', () => {
    const capsules = [
      createCapsule({ id: 'cap_1', trigger: ['build-fail'] }),
      createCapsule({ id: 'cap_2', trigger: ['mkdir', '-p', 'Windows'] })
    ];

    const resolved = resolveCapsuleGenes(capsules, genes);

    expect(resolved.map(item => item.gene)).toEqual(['gene_repair_build', 'gene_windows_cmd']);
  });
});
