/**
 * Capsule Manager - 胶囊管理器
 */

import type { Capsule, EnvFingerprint, Signal } from '../types/gene-capsule-schema';
import { matchPatternToSignals } from './gene-selector';

export interface CapsuleStore {
  get(id: string): Promise<Capsule | undefined>;
  getAll(): Promise<Capsule[]>;
  add(capsule: Capsule): Promise<void>;
  update(capsule: Capsule): Promise<void>;
  remove(id: string): Promise<void>;
  searchBySignals(signals: Signal[]): Promise<Capsule[]>;
  searchByGene(geneId: string): Promise<Capsule[]>;
  searchByCategory(category: string): Promise<Capsule[]>;
}

export interface ScoredCapsule {
  capsule: Capsule;
  score: number;
  signalScore: number;
  envScore: number;
  successWeight: number;
}

function isCapsuleSelectable(capsule: Capsule, currentEnv: EnvFingerprint): boolean {
  if (capsule._deleted || capsule.outcome.status === 'failed') {
    return false;
  }

  return checkEnvironmentCompatibility(capsule, currentEnv).compatible;
}

export function selectCapsule(
  capsules: Capsule[],
  signals: readonly string[],
  currentEnv: EnvFingerprint
): Capsule | undefined {
  if (capsules.length === 0) return undefined;

  const activeCapsules = capsules.filter(capsule => isCapsuleSelectable(capsule, currentEnv));
  if (activeCapsules.length === 0) return undefined;

  const scored: ScoredCapsule[] = activeCapsules.map(capsule => {
    let signalScore = 0;
    capsule.trigger.forEach(trigger => {
      if (matchPatternToSignals(trigger, signals)) {
        signalScore++;
      }
    });

    let envScore = 0;
    if (capsule.env_fingerprint.platform === currentEnv.platform) envScore += 2;
    if (capsule.env_fingerprint.arch === currentEnv.arch) envScore += 1;
    if (capsule.env_fingerprint.node_version === currentEnv.node_version) envScore += 1;

    const successWeight = capsule.outcome.status === 'success'
      ? 1.5
      : capsule.outcome.status === 'partial'
        ? 1.0
        : 0.5;

    return {
      capsule,
      score: (signalScore + envScore) * capsule.confidence * successWeight,
      signalScore,
      envScore,
      successWeight
    };
  });

  const valid = scored.filter(item => item.signalScore > 0).sort((left, right) => right.score - left.score);
  return valid.length > 0 ? valid[0].capsule : undefined;
}

export function findMatchingCapsules(
  capsules: Capsule[],
  signals: readonly string[],
  minSignalMatch: number = 1
): Capsule[] {
  return capsules.filter(capsule => {
    if (capsule._deleted || capsule.outcome.status === 'failed') {
      return false;
    }

    const matchCount = capsule.trigger.filter(trigger => matchPatternToSignals(trigger, signals)).length;
    return matchCount >= minSignalMatch;
  });
}

export interface ReuseDecision {
  shouldReuse: boolean;
  reason: string;
  confidence: number;
}

export function shouldReuseCapsule(
  capsule: Capsule,
  signals: readonly string[],
  currentEnv?: EnvFingerprint,
  minConfidence: number = 0.6
): ReuseDecision {
  if (capsule.confidence < minConfidence) {
    return {
      shouldReuse: false,
      reason: `Confidence ${capsule.confidence} below threshold ${minConfidence}`,
      confidence: capsule.confidence
    };
  }

  if (capsule.outcome.status === 'failed' || capsule._deleted) {
    return {
      shouldReuse: false,
      reason: 'Capsule is inactive or has failed outcome history',
      confidence: 0
    };
  }

  const matchCount = capsule.trigger.filter(trigger => matchPatternToSignals(trigger, signals)).length;
  if (matchCount < 2) {
    return {
      shouldReuse: false,
      reason: `Only ${matchCount} signal matches (need >= 2)`,
      confidence: capsule.confidence * (matchCount / 2)
    };
  }

  if (currentEnv) {
    const envCompat = checkEnvironmentCompatibility(capsule, currentEnv);
    if (!envCompat.compatible) {
      return {
        shouldReuse: false,
        reason: envCompat.reason,
        confidence: capsule.confidence * 0.5
      };
    }
  }

  return {
    shouldReuse: true,
    reason: 'All reuse criteria met',
    confidence: capsule.confidence
  };
}

export interface EnvironmentCompatibility {
  compatible: boolean;
  reason: string;
  compatibilityScore: number;
}

function checkEnvironmentCompatibility(capsule: Capsule, currentEnv: EnvFingerprint): EnvironmentCompatibility {
  let score = 0;
  let maxScore = 0;

  maxScore += 3;
  if (capsule.env_fingerprint.platform === currentEnv.platform) {
    score += 3;
  } else {
    return {
      compatible: false,
      reason: `Platform mismatch: ${capsule.env_fingerprint.platform} vs ${currentEnv.platform}`,
      compatibilityScore: 0
    };
  }

  maxScore += 2;
  score += capsule.env_fingerprint.arch === currentEnv.arch ? 2 : 1;

  maxScore += 1;
  if (capsule.env_fingerprint.node_version === currentEnv.node_version) {
    score += 1;
  } else if (majorVersionMatch(capsule.env_fingerprint.node_version, currentEnv.node_version)) {
    score += 0.5;
  }

  const compatibilityScore = score / maxScore;
  return {
    compatible: compatibilityScore >= 0.6,
    reason: compatibilityScore >= 0.6
      ? `Environment compatible (${(compatibilityScore * 100).toFixed(0)}%)`
      : `Environment compatibility low (${(compatibilityScore * 100).toFixed(0)}%)`,
    compatibilityScore
  };
}

function majorVersionMatch(v1?: string, v2?: string): boolean {
  if (!v1 || !v2) return false;
  const major1 = v1.replace(/^v/i, '').split('.')[0];
  const major2 = v2.replace(/^v/i, '').split('.')[0];
  return major1 === major2;
}

export function updateCapsuleFeedback(
  capsule: Capsule,
  outcomeStatus: Capsule['outcome']['status'],
  outcomeScore: number
): Capsule {
  const adjustedConfidence = outcomeStatus === 'success'
    ? Math.min(0.99, capsule.confidence + 0.05)
    : outcomeStatus === 'failed'
      ? Math.max(0.05, capsule.confidence - 0.1)
      : capsule.confidence;

  const nextScore = capsule.outcome.score > 0
    ? Number(((capsule.outcome.score * 0.6) + (outcomeScore * 0.4)).toFixed(4))
    : outcomeScore;

  return {
    ...capsule,
    confidence: Number(adjustedConfidence.toFixed(4)),
    outcome: {
      ...capsule.outcome,
      status: outcomeStatus,
      score: Number(nextScore.toFixed(4))
    },
    metadata: {
      ...(capsule.metadata || { created_at: new Date().toISOString() }),
      applied_at: new Date().toISOString()
    }
  };
}

export interface CapsuleStats {
  total: number;
  byStatus: Map<string, number>;
  byGene: Map<string, number>;
  avgConfidence: number;
  avgScore: number;
  successRate: number;
}

export function analyzeCapsules(capsules: Capsule[]): CapsuleStats {
  const byStatus = new Map<string, number>();
  const byGene = new Map<string, number>();
  let totalConfidence = 0;
  let totalScore = 0;
  let successCount = 0;

  capsules.forEach(capsule => {
    byStatus.set(capsule.outcome.status, (byStatus.get(capsule.outcome.status) || 0) + 1);
    byGene.set(capsule.gene, (byGene.get(capsule.gene) || 0) + 1);
    totalConfidence += capsule.confidence;
    totalScore += capsule.outcome.score;
    if (capsule.outcome.status === 'success') successCount++;
  });

  return {
    total: capsules.length,
    byStatus,
    byGene,
    avgConfidence: capsules.length > 0 ? totalConfidence / capsules.length : 0,
    avgScore: capsules.length > 0 ? totalScore / capsules.length : 0,
    successRate: capsules.length > 0 ? successCount / capsules.length : 0
  };
}

export function calculateCapsuleHealth(capsule: Capsule): number {
  let health = 1;
  if (capsule.outcome.status === 'failed') health *= 0.3;
  else if (capsule.outcome.status === 'partial') health *= 0.7;

  health *= capsule.confidence;
  if (capsule.blast_radius.files > 20) health *= 0.8;
  if (capsule.blast_radius.lines > 200) health *= 0.9;
  return Number(Math.max(0, Math.min(1, health)).toFixed(4));
}
