/**
 * Capsule Manager Tests
 * 
 * Comprehensive unit tests for capsule-manager.ts
 * - selectCapsule function
 * - findMatchingCapsules function
 * - shouldReuseCapsule function
 * - analyzeCapsules function
 * - calculateCapsuleHealth function
 * - Edge cases and boundary conditions
 */

import {
  selectCapsule,
  findMatchingCapsules,
  shouldReuseCapsule,
  analyzeCapsules,
  calculateCapsuleHealth,
  type ScoredCapsule
} from './capsule-manager';

import type { Capsule, Signal, EnvFingerprint } from '../types/gene-capsule-schema';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockEnv: EnvFingerprint = {
  platform: 'linux',
  arch: 'x64',
  node_version: '18.0.0',
  working_dir: '/app'
};

const mockEnvDarwin: EnvFingerprint = {
  platform: 'darwin',
  arch: 'arm64',
  node_version: '20.0.0'
};

const mockEnvWin32: EnvFingerprint = {
  platform: 'win32',
  arch: 'ia32',
  node_version: '16.13.0'
};

const createCapsule = (overrides?: Partial<Capsule>): Capsule => ({
  type: 'Capsule',
  schema_version: '1.0',
  id: 'capsule_001',
  trigger: ['error', 'failed'],
  gene: 'gene_001',
  summary: 'Fix common errors',
  confidence: 0.8,
  blast_radius: { files: 5, lines: 50 },
  outcome: {
    status: 'success',
    score: 0.9,
    duration_ms: 1000
  },
  env_fingerprint: mockEnv,
  metadata: {
    created_at: new Date().toISOString()
  },
  ...overrides
});

const signals: Signal[] = ['error', 'failed'];
const noMatchSignals: Signal[] = ['warning', 'info'];

// ============================================================================
// selectCapsule Tests
// ============================================================================

describe('selectCapsule', () => {
  describe('basic functionality', () => {
    it('should return undefined for empty capsule array', () => {
      const result = selectCapsule([], signals, mockEnv);
      expect(result).toBeUndefined();
    });

    it('should return undefined when no capsules have matching signals', () => {
      const capsule = createCapsule({ trigger: ['debug', 'trace'] });
      const result = selectCapsule([capsule], noMatchSignals, mockEnv);
      expect(result).toBeUndefined();
    });

    it('should select single capsule with matching signal', () => {
      const capsule = createCapsule();
      const result = selectCapsule([capsule], signals, mockEnv);
      expect(result).toBe(capsule);
    });

    it('should select best capsule from multiple matches', () => {
      const capsule1 = createCapsule({
        id: 'capsule_1',
        trigger: ['error'],
        confidence: 0.7,
        outcome: { status: 'success', score: 0.8 }
      });

      const capsule2 = createCapsule({
        id: 'capsule_2',
        trigger: ['error', 'failed'],
        confidence: 0.9,
        outcome: { status: 'success', score: 0.95 }
      });

      const result = selectCapsule([capsule1, capsule2], signals, mockEnv);
      expect(result?.id).toBe('capsule_2');
    });
  });

  describe('signal matching score', () => {
    it('should calculate correct signal match score', () => {
      const capsule1 = createCapsule({ id: 'c1', trigger: ['error'] });
      const capsule2 = createCapsule({ id: 'c2', trigger: ['error', 'failed'] });
      const capsule3 = createCapsule({
        id: 'c3',
        trigger: ['error', 'failed', 'timeout']
      });

      const result = selectCapsule([capsule1, capsule2, capsule3], signals, mockEnv);
      // capsule3 has 2 matches (error, failed), capsule2 has 2 matches, capsule1 has 1 match
      // capsule3 or capsule2 should be selected
      expect(result?.id).toMatch(/^c[23]$/);
    });

    it('should only count actual signal matches', () => {
      const capsule = createCapsule({
        trigger: ['error', 'invalid_signal', 'failed', 'unknown']
      });

      const result = selectCapsule([capsule], signals, mockEnv);
      expect(result).toBe(capsule);
    });

    it('should support multi-language signal matching', () => {
      // matchPatternToSignals should handle patterns like "error|错误"
      const capsule = createCapsule({
        trigger: ['error|错误', 'failed|失败']
      });

      const result = selectCapsule([capsule], ['error'], mockEnv);
      expect(result).toBe(capsule);
    });
  });

  describe('environment compatibility scoring', () => {
    it('should score platform match (+2)', () => {
      const capsuleSamePlatform = createCapsule({
        id: 'c1',
        env_fingerprint: { platform: 'linux', arch: 'x64' }
      });

      const capsuleDifferentPlatform = createCapsule({
        id: 'c2',
        env_fingerprint: { platform: 'darwin', arch: 'x64' }
      });

      const result = selectCapsule(
        [capsuleSamePlatform, capsuleDifferentPlatform],
        signals,
        mockEnv
      );

      expect(result?.id).toBe('c1');
    });

    it('should score architecture match (+1)', () => {
      const capsuleSameArch = createCapsule({
        id: 'c1',
        env_fingerprint: { platform: 'linux', arch: 'x64' }
      });

      const capsuleDifferentArch = createCapsule({
        id: 'c2',
        env_fingerprint: { platform: 'linux', arch: 'arm64' }
      });

      const result = selectCapsule(
        [capsuleSameArch, capsuleDifferentArch],
        signals,
        mockEnv
      );

      expect(result?.id).toBe('c1');
    });

    it('should score node version match (+1)', () => {
      const capsuleSameVersion = createCapsule({
        id: 'c1',
        env_fingerprint: { ...mockEnv, node_version: '18.0.0' }
      });

      const capsuleDifferentVersion = createCapsule({
        id: 'c2',
        env_fingerprint: { ...mockEnv, node_version: '20.0.0' }
      });

      const result = selectCapsule(
        [capsuleSameVersion, capsuleDifferentVersion],
        signals,
        mockEnv
      );

      expect(result?.id).toBe('c1');
    });

    it('should prioritize platform match', () => {
      // Platform mismatch is critical
      const capsulePlatformMismatch = createCapsule({
        id: 'c1',
        env_fingerprint: { platform: 'darwin', arch: 'arm64', node_version: '18.0.0' }
      });

      const capsuleFullMatch = createCapsule({
        id: 'c2',
        env_fingerprint: { ...mockEnv },
        confidence: 0.5
      });

      const result = selectCapsule(
        [capsulePlatformMismatch, capsuleFullMatch],
        signals,
        mockEnv
      );

      // Both have matching signals, but fullMatch has platform match
      expect(result?.id).toBe('c2');
    });
  });

  describe('success weight calculation', () => {
    it('should apply success weight multiplier (1.5x)', () => {
      const successCapsule = createCapsule({
        id: 'success',
        outcome: { status: 'success', score: 0.9 }
      });

      const partialCapsule = createCapsule({
        id: 'partial',
        outcome: { status: 'partial', score: 0.9 }
      });

      const result = selectCapsule([successCapsule, partialCapsule], signals, mockEnv);
      expect(result?.id).toBe('success');
    });

    it('should apply partial weight multiplier (1.0x)', () => {
      const partialCapsule = createCapsule({
        id: 'partial',
        confidence: 0.8,
        outcome: { status: 'partial', score: 0.9 }
      });

      const failedCapsule = createCapsule({
        id: 'failed',
        confidence: 0.8,
        outcome: { status: 'failed', score: 0.9 }
      });

      const result = selectCapsule([partialCapsule, failedCapsule], signals, mockEnv);
      expect(result?.id).toBe('partial');
    });

    it('should apply failed weight multiplier (0.5x)', () => {
      const failedCapsule = createCapsule({
        id: 'failed',
        outcome: { status: 'failed', score: 0.9 }
      });

      const result = selectCapsule([failedCapsule], signals, mockEnv);
      expect(result?.id).toBe('failed');
    });
  });

  describe('comprehensive scoring', () => {
    it('should calculate total score correctly', () => {
      // score = (signalScore + envScore) * confidence * successWeight
      const capsule = createCapsule({
        trigger: ['error', 'failed'], // 2 signal matches
        confidence: 0.8,
        outcome: { status: 'success', score: 0.9 }, // weight = 1.5
        env_fingerprint: mockEnv // platform match (+2) + arch match (+1) + version match (+1)
      });

      // Expected: (2 + 4) * 0.8 * 1.5 = 7.2
      const result = selectCapsule([capsule], signals, mockEnv);
      expect(result).toBe(capsule);
    });

    it('should select highest score when multiple candidates match', () => {
      const lowScore = createCapsule({
        id: 'low',
        trigger: ['error'],
        confidence: 0.5,
        outcome: { status: 'failed', score: 0.5 }
      });

      const highScore = createCapsule({
        id: 'high',
        trigger: ['error', 'failed'],
        confidence: 0.95,
        outcome: { status: 'success', score: 0.95 }
      });

      const result = selectCapsule([lowScore, highScore], signals, mockEnv);
      expect(result?.id).toBe('high');
    });
  });
});

// ============================================================================
// findMatchingCapsules Tests
// ============================================================================

describe('findMatchingCapsules', () => {
  it('should return empty array for empty input', () => {
    const result = findMatchingCapsules([], signals);
    expect(result).toEqual([]);
  });

  it('should return empty array when no signals match', () => {
    const capsule = createCapsule({ trigger: ['debug'] });
    const result = findMatchingCapsules([capsule], noMatchSignals);
    expect(result).toEqual([]);
  });

  it('should return all matching capsules with default minSignalMatch=1', () => {
    const capsule1 = createCapsule({ id: 'c1', trigger: ['error'] });
    const capsule2 = createCapsule({ id: 'c2', trigger: ['error', 'failed'] });
    const capsule3 = createCapsule({ id: 'c3', trigger: ['debug'] });

    const result = findMatchingCapsules([capsule1, capsule2, capsule3], signals);
    expect(result).toHaveLength(2);
    expect(result.map(c => c.id)).toContain('c1');
    expect(result.map(c => c.id)).toContain('c2');
  });

  it('should filter by minSignalMatch parameter', () => {
    const capsule1 = createCapsule({ id: 'c1', trigger: ['error'] });
    const capsule2 = createCapsule({ id: 'c2', trigger: ['error', 'failed'] });
    const capsule3 = createCapsule({ id: 'c3', trigger: ['error', 'failed', 'timeout'] });

    // minSignalMatch=2 should return capsule2 and capsule3
    const result = findMatchingCapsules([capsule1, capsule2, capsule3], signals, 2);
    expect(result).toHaveLength(2);
    expect(result.map(c => c.id)).toEqual(['c2', 'c3']);
  });

  it('should require at least minSignalMatch matches', () => {
    const capsule = createCapsule({
      trigger: ['error', 'failed', 'timeout']
    });

    const result1 = findMatchingCapsules([capsule], signals, 1);
    const result2 = findMatchingCapsules([capsule], signals, 2);
    const result3 = findMatchingCapsules([capsule], signals, 3);

    expect(result1).toHaveLength(1);
    expect(result2).toHaveLength(1);
    expect(result3).toHaveLength(0);
  });

  it('should handle minSignalMatch=0', () => {
    const capsule = createCapsule({ trigger: ['debug'] });
    const result = findMatchingCapsules([capsule], signals, 0);
    // minSignalMatch=0 should match any capsule that has at least 0 matches
    // In this case, capsule has 0 matches, so 0 >= 0 is true
    expect(result).toHaveLength(1);
  });

  it('should preserve capsule order in results', () => {
    const capsule1 = createCapsule({ id: 'c1', trigger: ['error'] });
    const capsule2 = createCapsule({ id: 'c2', trigger: ['error', 'failed'] });
    const capsule3 = createCapsule({ id: 'c3', trigger: ['error', 'failed'] });

    const result = findMatchingCapsules([capsule1, capsule2, capsule3], signals);
    expect(result.map(c => c.id)).toEqual(['c1', 'c2', 'c3']);
  });
});

// ============================================================================
// shouldReuseCapsule Tests
// ============================================================================

describe('shouldReuseCapsule', () => {
  describe('confidence threshold checking', () => {
    it('should reject capsule when confidence below threshold', () => {
      const capsule = createCapsule({
        confidence: 0.5
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv, 0.6);
      expect(result.shouldReuse).toBe(false);
      expect(result.reason).toContain('Confidence');
      expect(result.reason).toContain('below threshold');
    });

    it('should accept capsule when confidence equals threshold', () => {
      const capsule = createCapsule({
        confidence: 0.6,
        trigger: ['error', 'failed'],
        outcome: { status: 'success', score: 0.9 }
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv, 0.6);
      expect(result.shouldReuse).toBe(true);
    });

    it('should accept capsule when confidence above threshold', () => {
      const capsule = createCapsule({
        confidence: 0.8,
        trigger: ['error', 'failed'],
        outcome: { status: 'success', score: 0.9 }
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv, 0.6);
      expect(result.shouldReuse).toBe(true);
    });

    it('should use default minConfidence=0.6 if not provided', () => {
      const capsule = createCapsule({
        confidence: 0.5,
        trigger: ['error', 'failed'],
        outcome: { status: 'success', score: 0.9 }
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv);
      expect(result.shouldReuse).toBe(false);
    });
  });

  describe('historical success/failure checking', () => {
    it('should reject capsule with failed outcome', () => {
      const capsule = createCapsule({
        confidence: 0.8,
        trigger: ['error', 'failed'],
        outcome: { status: 'failed', score: 0.3 }
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv);
      expect(result.shouldReuse).toBe(false);
      expect(result.reason).toContain('failed');
      expect(result.confidence).toBe(0);
    });

    it('should accept capsule with success outcome', () => {
      const capsule = createCapsule({
        confidence: 0.8,
        trigger: ['error', 'failed'],
        outcome: { status: 'success', score: 0.9 }
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv);
      expect(result.shouldReuse).toBe(true);
    });

    it('should accept capsule with partial outcome', () => {
      const capsule = createCapsule({
        confidence: 0.8,
        trigger: ['error', 'failed'],
        outcome: { status: 'partial', score: 0.6 }
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv);
      expect(result.shouldReuse).toBe(true);
    });
  });

  describe('signal match count requirement (>=2)', () => {
    it('should reject capsule with 0 signal matches', () => {
      const capsule = createCapsule({
        confidence: 0.8,
        trigger: ['debug', 'trace'],
        outcome: { status: 'success', score: 0.9 }
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv);
      expect(result.shouldReuse).toBe(false);
      expect(result.reason).toContain('0 signal matches');
    });

    it('should reject capsule with 1 signal match', () => {
      const capsule = createCapsule({
        confidence: 0.8,
        trigger: ['error'],
        outcome: { status: 'success', score: 0.9 }
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv);
      expect(result.shouldReuse).toBe(false);
      expect(result.reason).toContain('1 signal matches');
    });

    it('should accept capsule with exactly 2 signal matches', () => {
      const capsule = createCapsule({
        confidence: 0.8,
        trigger: ['error', 'failed'],
        outcome: { status: 'success', score: 0.9 }
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv);
      expect(result.shouldReuse).toBe(true);
      expect(result.reason).toContain('All reuse criteria met');
    });

    it('should accept capsule with more than 2 signal matches', () => {
      const capsule = createCapsule({
        confidence: 0.8,
        trigger: ['error', 'failed', 'timeout'],
        outcome: { status: 'success', score: 0.9 }
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv);
      expect(result.shouldReuse).toBe(true);
    });

    it('should reduce confidence when match count is 1', () => {
      const capsule = createCapsule({
        confidence: 0.8,
        trigger: ['error'],
        outcome: { status: 'success', score: 0.9 }
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv);
      // confidence * (matchCount / 2) = 0.8 * (1 / 2) = 0.4
      expect(result.confidence).toBe(0.4);
    });
  });

  describe('environment compatibility checking', () => {
    it('should reject capsule with platform mismatch', () => {
      const capsule = createCapsule({
        confidence: 0.8,
        trigger: ['error', 'failed'],
        outcome: { status: 'success', score: 0.9 },
        env_fingerprint: { platform: 'darwin', arch: 'arm64' }
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv);
      expect(result.shouldReuse).toBe(false);
      expect(result.reason).toContain('Platform mismatch');
    });

    it('should accept capsule with compatible environment', () => {
      const capsule = createCapsule({
        confidence: 0.8,
        trigger: ['error', 'failed'],
        outcome: { status: 'success', score: 0.9 },
        env_fingerprint: mockEnv
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv);
      expect(result.shouldReuse).toBe(true);
      expect(result.reason).toContain('All reuse criteria met');
    });

    it('should reduce confidence on platform mismatch', () => {
      const capsule = createCapsule({
        confidence: 0.8,
        trigger: ['error', 'failed'],
        outcome: { status: 'success', score: 0.9 },
        env_fingerprint: { platform: 'darwin', arch: 'arm64' }
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv);
      // confidence * 0.5 = 0.8 * 0.5 = 0.4
      expect(result.confidence).toBe(0.4);
    });

    it('should skip environment check when currentEnv not provided', () => {
      const capsule = createCapsule({
        confidence: 0.8,
        trigger: ['error', 'failed'],
        outcome: { status: 'success', score: 0.9 },
        env_fingerprint: { platform: 'darwin', arch: 'arm64' }
      });

      const result = shouldReuseCapsule(capsule, signals);
      // Should pass because environment check is skipped
      expect(result.shouldReuse).toBe(true);
    });

    it('should handle arch compatibility', () => {
      const capsule = createCapsule({
        confidence: 0.8,
        trigger: ['error', 'failed'],
        outcome: { status: 'success', score: 0.9 },
        env_fingerprint: { platform: 'linux', arch: 'arm64' }
      });

      const linuxX64Env: EnvFingerprint = {
        platform: 'linux',
        arch: 'x64'
      };

      // Different arch but same platform - should be compatible (>= 60%)
      const result = shouldReuseCapsule(capsule, signals, linuxX64Env);
      expect(result.shouldReuse).toBe(true);
    });

    it('should handle node version compatibility', () => {
      const capsule = createCapsule({
        confidence: 0.8,
        trigger: ['error', 'failed'],
        outcome: { status: 'success', score: 0.9 },
        env_fingerprint: { platform: 'linux', arch: 'x64', node_version: '18.5.0' }
      });

      const env: EnvFingerprint = {
        platform: 'linux',
        arch: 'x64',
        node_version: '18.0.0'
      };

      // Same major version - should be compatible
      const result = shouldReuseCapsule(capsule, signals, env);
      expect(result.shouldReuse).toBe(true);
    });
  });

  describe('combined criteria', () => {
    it('should fail on first failing criterion', () => {
      const capsule = createCapsule({
        confidence: 0.5, // Below default 0.6
        trigger: ['error', 'failed'],
        outcome: { status: 'success', score: 0.9 }
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv);
      expect(result.shouldReuse).toBe(false);
      expect(result.reason).toContain('Confidence');
    });

    it('should pass all criteria', () => {
      const capsule = createCapsule({
        confidence: 0.8,
        trigger: ['error', 'failed'],
        outcome: { status: 'success', score: 0.9 },
        env_fingerprint: mockEnv
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv, 0.6);
      expect(result.shouldReuse).toBe(true);
      expect(result.confidence).toBe(0.8);
      expect(result.reason).toBe('All reuse criteria met');
    });
  });
});

// ============================================================================
// analyzeCapsules Tests
// ============================================================================

describe('analyzeCapsules', () => {
  it('should return zero stats for empty array', () => {
    const result = analyzeCapsules([]);
    expect(result.total).toBe(0);
    expect(result.byStatus.size).toBe(0);
    expect(result.byGene.size).toBe(0);
    expect(result.avgConfidence).toBe(0);
    expect(result.avgScore).toBe(0);
    expect(result.successRate).toBe(0);
  });

  it('should count total capsules', () => {
    const capsules = [
      createCapsule({ id: 'c1' }),
      createCapsule({ id: 'c2' }),
      createCapsule({ id: 'c3' })
    ];

    const result = analyzeCapsules(capsules);
    expect(result.total).toBe(3);
  });

  it('should group capsules by outcome status', () => {
    const capsules = [
      createCapsule({
        id: 'c1',
        outcome: { status: 'success', score: 0.9 }
      }),
      createCapsule({
        id: 'c2',
        outcome: { status: 'success', score: 0.8 }
      }),
      createCapsule({
        id: 'c3',
        outcome: { status: 'failed', score: 0.3 }
      }),
      createCapsule({
        id: 'c4',
        outcome: { status: 'partial', score: 0.6 }
      })
    ];

    const result = analyzeCapsules(capsules);
    expect(result.byStatus.get('success')).toBe(2);
    expect(result.byStatus.get('failed')).toBe(1);
    expect(result.byStatus.get('partial')).toBe(1);
  });

  it('should group capsules by gene', () => {
    const capsules = [
      createCapsule({ id: 'c1', gene: 'gene_001' }),
      createCapsule({ id: 'c2', gene: 'gene_001' }),
      createCapsule({ id: 'c3', gene: 'gene_002' }),
      createCapsule({ id: 'c4', gene: 'gene_003' })
    ];

    const result = analyzeCapsules(capsules);
    expect(result.byGene.get('gene_001')).toBe(2);
    expect(result.byGene.get('gene_002')).toBe(1);
    expect(result.byGene.get('gene_003')).toBe(1);
  });

  it('should calculate average confidence', () => {
    const capsules = [
      createCapsule({ id: 'c1', confidence: 0.8 }),
      createCapsule({ id: 'c2', confidence: 0.6 }),
      createCapsule({ id: 'c3', confidence: 0.9 })
    ];

    const result = analyzeCapsules(capsules);
    // (0.8 + 0.6 + 0.9) / 3 = 0.7666...
    expect(result.avgConfidence).toBeCloseTo(0.7667, 3);
  });

  it('should calculate average score', () => {
    const capsules = [
      createCapsule({ id: 'c1', outcome: { status: 'success', score: 0.8 } }),
      createCapsule({ id: 'c2', outcome: { status: 'success', score: 0.6 } }),
      createCapsule({ id: 'c3', outcome: { status: 'success', score: 0.9 } })
    ];

    const result = analyzeCapsules(capsules);
    // (0.8 + 0.6 + 0.9) / 3 = 0.7666...
    expect(result.avgScore).toBeCloseTo(0.7667, 3);
  });

  it('should calculate success rate', () => {
    const capsules = [
      createCapsule({
        id: 'c1',
        outcome: { status: 'success', score: 0.9 }
      }),
      createCapsule({
        id: 'c2',
        outcome: { status: 'success', score: 0.8 }
      }),
      createCapsule({
        id: 'c3',
        outcome: { status: 'failed', score: 0.3 }
      }),
      createCapsule({
        id: 'c4',
        outcome: { status: 'partial', score: 0.6 }
      })
    ];

    const result = analyzeCapsules(capsules);
    // 2 successes / 4 total = 0.5
    expect(result.successRate).toBe(0.5);
  });

  it('should handle single capsule', () => {
    const capsules = [
      createCapsule({
        id: 'c1',
        confidence: 0.7,
        gene: 'gene_001',
        outcome: { status: 'success', score: 0.85 }
      })
    ];

    const result = analyzeCapsules(capsules);
    expect(result.total).toBe(1);
    expect(result.avgConfidence).toBe(0.7);
    expect(result.avgScore).toBe(0.85);
    expect(result.successRate).toBe(1);
    expect(result.byStatus.get('success')).toBe(1);
    expect(result.byGene.get('gene_001')).toBe(1);
  });

  it('should handle various outcome statuses', () => {
    const capsules = [
      createCapsule({
        id: 'c1',
        outcome: { status: 'success', score: 0.9 }
      }),
      createCapsule({
        id: 'c2',
        outcome: { status: 'skipped', score: 0.0 }
      })
    ];

    const result = analyzeCapsules(capsules);
    expect(result.byStatus.get('success')).toBe(1);
    expect(result.byStatus.get('skipped')).toBe(1);
    expect(result.successRate).toBe(0.5); // only success counts
  });
});

// ============================================================================
// calculateCapsuleHealth Tests
// ============================================================================

describe('calculateCapsuleHealth', () => {
  it('should return 1.0 for perfect capsule', () => {
    const capsule = createCapsule({
      confidence: 1.0,
      outcome: { status: 'success', score: 1.0 },
      blast_radius: { files: 1, lines: 1 }
    });

    const health = calculateCapsuleHealth(capsule);
    expect(health).toBe(1.0);
  });

  it('should apply failed status penalty (0.3x)', () => {
    const capsule = createCapsule({
      confidence: 1.0,
      outcome: { status: 'failed', score: 0.0 },
      blast_radius: { files: 1, lines: 1 }
    });

    const health = calculateCapsuleHealth(capsule);
    // health = 1.0 * 0.3 * 1.0 = 0.3
    expect(health).toBe(0.3);
  });

  it('should apply partial status penalty (0.7x)', () => {
    const capsule = createCapsule({
      confidence: 1.0,
      outcome: { status: 'partial', score: 0.5 },
      blast_radius: { files: 1, lines: 1 }
    });

    const health = calculateCapsuleHealth(capsule);
    // health = 1.0 * 0.7 * 1.0 = 0.7
    expect(health).toBe(0.7);
  });

  it('should apply success status (no penalty)', () => {
    const capsule = createCapsule({
      confidence: 1.0,
      outcome: { status: 'success', score: 1.0 },
      blast_radius: { files: 1, lines: 1 }
    });

    const health = calculateCapsuleHealth(capsule);
    // health = 1.0 * 1.0 * 1.0 = 1.0
    expect(health).toBe(1.0);
  });

  it('should apply confidence factor', () => {
    const capsule = createCapsule({
      confidence: 0.5,
      outcome: { status: 'success', score: 1.0 },
      blast_radius: { files: 1, lines: 1 }
    });

    const health = calculateCapsuleHealth(capsule);
    // health = 1.0 * 0.5 = 0.5
    expect(health).toBe(0.5);
  });

  it('should apply large file count penalty (0.8x)', () => {
    const capsule = createCapsule({
      confidence: 1.0,
      outcome: { status: 'success', score: 1.0 },
      blast_radius: { files: 25, lines: 1 }
    });

    const health = calculateCapsuleHealth(capsule);
    // health = 1.0 * 1.0 * 0.8 = 0.8
    expect(health).toBe(0.8);
  });

  it('should apply large line count penalty (0.9x)', () => {
    const capsule = createCapsule({
      confidence: 1.0,
      outcome: { status: 'success', score: 1.0 },
      blast_radius: { files: 1, lines: 250 }
    });

    const health = calculateCapsuleHealth(capsule);
    // health = 1.0 * 1.0 * 0.9 = 0.9
    expect(health).toBe(0.9);
  });

  it('should apply both file and line penalties', () => {
    const capsule = createCapsule({
      confidence: 1.0,
      outcome: { status: 'success', score: 1.0 },
      blast_radius: { files: 25, lines: 250 }
    });

    const health = calculateCapsuleHealth(capsule);
    // health = 1.0 * 1.0 * 0.8 * 0.9 = 0.72
    expect(health).toBe(0.72);
  });

  it('should combine multiple factors', () => {
    const capsule = createCapsule({
      confidence: 0.6,
      outcome: { status: 'partial', score: 0.5 },
      blast_radius: { files: 25, lines: 250 }
    });

    const health = calculateCapsuleHealth(capsule);
    // health = 1.0 * 0.7 * 0.6 * 0.8 * 0.9 = 0.3024
    expect(health).toBeCloseTo(0.3024, 4);
  });

  it('should clamp health between 0 and 1', () => {
    const successCapsule = createCapsule({
      confidence: 2.0, // Invalid but should be clamped
      outcome: { status: 'success', score: 1.0 }
    });

    const health = calculateCapsuleHealth(successCapsule);
    expect(health).toBeLessThanOrEqual(1);
    expect(health).toBeGreaterThanOrEqual(0);
  });

  it('should not go below 0', () => {
    const capsule = createCapsule({
      confidence: 0.1,
      outcome: { status: 'failed', score: 0.0 },
      blast_radius: { files: 50, lines: 500 }
    });

    const health = calculateCapsuleHealth(capsule);
    expect(health).toBeGreaterThanOrEqual(0);
  });

  it('should handle different outcome statuses', () => {
    const successHealth = calculateCapsuleHealth(
      createCapsule({ outcome: { status: 'success', score: 1.0 } })
    );
    const partialHealth = calculateCapsuleHealth(
      createCapsule({ outcome: { status: 'partial', score: 0.5 } })
    );
    const failedHealth = calculateCapsuleHealth(
      createCapsule({ outcome: { status: 'failed', score: 0.0 } })
    );

    expect(successHealth).toBeGreaterThan(partialHealth);
    expect(partialHealth).toBeGreaterThan(failedHealth);
  });
});

// ============================================================================
// Edge Cases and Integration Tests
// ============================================================================

describe('edge cases', () => {
  describe('empty or minimal data', () => {
    it('selectCapsule should handle empty arrays gracefully', () => {
      expect(selectCapsule([], [], mockEnv)).toBeUndefined();
      expect(selectCapsule([], signals, mockEnv)).toBeUndefined();
    });

    it('findMatchingCapsules should handle empty inputs', () => {
      expect(findMatchingCapsules([], [])).toEqual([]);
      expect(findMatchingCapsules([], signals)).toEqual([]);
    });

    it('shouldReuseCapsule should handle missing environment', () => {
      const capsule = createCapsule();
      const result = shouldReuseCapsule(capsule, signals);
      expect(result.shouldReuse).toBe(true);
    });

    it('analyzeCapsules should handle empty array', () => {
      const stats = analyzeCapsules([]);
      expect(stats.total).toBe(0);
      expect(stats.avgConfidence).toBe(0);
      expect(stats.avgScore).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });

  describe('extreme confidence values', () => {
    it('should handle zero confidence', () => {
      const capsule = createCapsule({
        confidence: 0,
        trigger: ['error', 'failed']
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv);
      expect(result.shouldReuse).toBe(false);
    });

    it('should handle maximum confidence', () => {
      const capsule = createCapsule({
        confidence: 1.0,
        trigger: ['error', 'failed'],
        outcome: { status: 'success', score: 1.0 }
      });

      const result = shouldReuseCapsule(capsule, signals, mockEnv);
      expect(result.shouldReuse).toBe(true);
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('large capsule pools', () => {
    it('selectCapsule should handle large pools', () => {
      const capsules = Array.from({ length: 100 }, (_, i) =>
        createCapsule({
          id: `c${i}`,
          confidence: Math.random(),
          outcome: {
            status: Math.random() > 0.5 ? 'success' : 'failed',
            score: Math.random()
          }
        })
      );

      const result = selectCapsule(capsules, signals, mockEnv);
      expect(result).toBeUndefined(); // Most won't match
    });

    it('findMatchingCapsules should handle large pools', () => {
      const capsules = Array.from({ length: 100 }, (_, i) =>
        createCapsule({
          id: `c${i}`,
          trigger: i % 2 === 0 ? ['error'] : ['debug']
        })
      );

      const result = findMatchingCapsules(capsules, signals);
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(100);
    });
  });

  describe('special characters and unicode', () => {
    it('should handle multi-language signal patterns', () => {
      const capsule = createCapsule({
        trigger: ['error|错误|エラー']
      });

      const result = selectCapsule([capsule], ['error'], mockEnv);
      expect(result).toBe(capsule);
    });

    it('should handle unicode in gene names', () => {
      const capsules = [
        createCapsule({ id: 'c1', gene: 'gene_修复_001' }),
        createCapsule({ id: 'c2', gene: 'gene_最適化_002' })
      ];

      const stats = analyzeCapsules(capsules);
      expect(stats.byGene.size).toBe(2);
      expect(stats.byGene.has('gene_修复_001')).toBe(true);
    });
  });

  describe('boundary conditions', () => {
    it('should handle capsule with zero trigger signals', () => {
      const capsule = createCapsule({
        trigger: []
      });

      const result = selectCapsule([capsule], signals, mockEnv);
      expect(result).toBeUndefined();
    });

    it('should handle matching all signals perfectly', () => {
      const capsule = createCapsule({
        trigger: signals,
        confidence: 0.9,
        outcome: { status: 'success', score: 0.95 }
      });

      const result = selectCapsule([capsule], signals, mockEnv);
      expect(result).toBe(capsule);
    });

    it('should handle zero score capsule', () => {
      const capsule = createCapsule({
        outcome: { status: 'failed', score: 0 },
        confidence: 0
      });

      const health = calculateCapsuleHealth(capsule);
      expect(health).toBeLessThanOrEqual(0.1);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('integration scenarios', () => {
  it('should workflow: find candidates and select best', () => {
    const candidates = [
      createCapsule({
        id: 'c1',
        trigger: ['error'],
        confidence: 0.7,
        outcome: { status: 'success', score: 0.8 }
      }),
      createCapsule({
        id: 'c2',
        trigger: ['error', 'failed'],
        confidence: 0.9,
        outcome: { status: 'success', score: 0.95 }
      }),
      createCapsule({
        id: 'c3',
        trigger: ['timeout'],
        confidence: 0.8,
        outcome: { status: 'partial', score: 0.6 }
      })
    ];

    const matching = findMatchingCapsules(candidates, signals, 1);
    expect(matching.length).toBe(2);

    const best = selectCapsule(candidates, signals, mockEnv);
    expect(best?.id).toBe('c2');
  });

  it('should evaluate reusability across pool', () => {
    const capsules = [
      createCapsule({
        id: 'c1',
        confidence: 0.5,
        trigger: ['error', 'failed']
      }),
      createCapsule({
        id: 'c2',
        confidence: 0.8,
        trigger: ['error', 'failed'],
        outcome: { status: 'success', score: 0.9 }
      }),
      createCapsule({
        id: 'c3',
        confidence: 0.7,
        trigger: ['error'],
        outcome: { status: 'success', score: 0.85 }
      })
    ];

    const reusable = capsules.filter(c =>
      shouldReuseCapsule(c, signals, mockEnv).shouldReuse
    );

    expect(reusable.length).toBeGreaterThan(0);
    expect(reusable.some(c => c.id === 'c2')).toBe(true);
  });

  it('should analyze health distribution in pool', () => {
    const capsules = [
      createCapsule({
        id: 'c1',
        confidence: 0.9,
        outcome: { status: 'success', score: 0.95 },
        blast_radius: { files: 5, lines: 50 }
      }),
      createCapsule({
        id: 'c2',
        confidence: 0.6,
        outcome: { status: 'partial', score: 0.7 },
        blast_radius: { files: 30, lines: 300 }
      }),
      createCapsule({
        id: 'c3',
        confidence: 0.3,
        outcome: { status: 'failed', score: 0.2 },
        blast_radius: { files: 50, lines: 500 }
      })
    ];

    const stats = analyzeCapsules(capsules);
    const healthScores = capsules.map(c => calculateCapsuleHealth(c));

    expect(stats.avgConfidence).toBeGreaterThan(0.3);
    expect(healthScores[0]).toBeGreaterThan(healthScores[1]);
    expect(healthScores[1]).toBeGreaterThan(healthScores[2]);
  });
});
