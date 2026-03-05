/**
 * E2E 测试用胶囊种子数据
 */

import type { Capsule } from '../../types/gene-capsule-schema';

export const SEED_CAPSULES: Capsule[] = [
  {
    type: 'Capsule',
    schema_version: '1.5.0',
    id: 'capsule_e2e_type_error_fix',
    trigger: ['error', 'exception', 'type_error'],
    gene: 'gene_e2e_repair_errors',
    summary: 'E2E test capsule: fixes type errors',
    confidence: 0.9,
    blast_radius: { files: 1, lines: 5 },
    outcome: {
      status: 'success',
      score: 0.9,
      duration_ms: 500
    },
    env_fingerprint: {
      node_version: process.version,
      platform: 'win32',
      arch: 'x64',
      working_dir: process.cwd()
    },
    metadata: {
      created_at: new Date().toISOString(),
      source: 'local',
      validated: true
    }
  },
  {
    type: 'Capsule',
    schema_version: '1.5.0',
    id: 'capsule_e2e_perf_opt',
    trigger: ['slow', 'performance', 'perf_bottleneck'],
    gene: 'gene_e2e_optimize_perf',
    summary: 'E2E test capsule: optimizes loop performance',
    confidence: 0.8,
    blast_radius: { files: 2, lines: 15 },
    outcome: {
      status: 'success',
      score: 0.85,
      duration_ms: 1200
    },
    env_fingerprint: {
      node_version: process.version,
      platform: 'win32',
      arch: 'x64'
    },
    metadata: {
      created_at: new Date().toISOString(),
      source: 'local',
      validated: true
    }
  }
];
