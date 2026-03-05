/**
 * E2E 测试用基因种子数据
 */

import type { Gene } from '../../types/gene-capsule-schema';

export const SEED_GENES: Gene[] = [
  {
    type: 'Gene',
    id: 'gene_e2e_repair_errors',
    category: 'repair',
    signals_match: ['error', 'exception', 'failed', 'undefined'],
    preconditions: ['signals contains error-related indicators'],
    strategy: [
      '从日志提取错误信号',
      '定位错误根因',
      '应用最小补丁',
      '验证修复'
    ],
    constraints: {
      max_files: 5,
      max_lines: 50,
      forbidden_paths: ['.git', 'node_modules'],
      timeout_ms: 30000
    },
    validation: ['npm test'],
    metadata: {
      author: 'e2e-test',
      version: '1.0.0',
      description: 'E2E 测试用错误修复基因',
      tags: ['test', 'repair']
    }
  },
  {
    type: 'Gene',
    id: 'gene_e2e_optimize_perf',
    category: 'optimize',
    signals_match: ['slow', 'perf_bottleneck', 'timeout', 'performance'],
    preconditions: ['signals contains performance-related indicators'],
    strategy: [
      '分析性能瓶颈',
      '识别热点代码',
      '应用优化策略'
    ],
    constraints: {
      max_files: 10,
      max_lines: 100,
      timeout_ms: 60000
    },
    metadata: {
      author: 'e2e-test',
      version: '1.0.0',
      description: 'E2E 测试用性能优化基因',
      tags: ['test', 'optimize']
    }
  },
  {
    type: 'Gene',
    id: 'gene_e2e_security_fix',
    category: 'security',
    signals_match: ['security', 'vulnerability', 'unsafe', 'injection'],
    preconditions: ['signals contains security-related indicators'],
    strategy: [
      '识别安全漏洞',
      '应用安全补丁',
      '验证安全性'
    ],
    constraints: {
      max_files: 3,
      max_lines: 30,
      forbidden_paths: ['.git', 'node_modules', '.env'],
      timeout_ms: 30000
    },
    metadata: {
      author: 'e2e-test',
      version: '1.0.0',
      description: 'E2E 测试用安全修复基因',
      tags: ['test', 'security']
    }
  }
];
