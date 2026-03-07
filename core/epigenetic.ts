/**
 * Epigenetic Module - 表观遗传标记
 */

import type { EnvFingerprint, EpigeneticMark, Gene, OutcomeStatus } from '../types/gene-capsule-schema';

/**
 * 非对称奖惩设计 (2:1)
 *
 * 失败惩罚(-0.1)是成功奖励(+0.05)的两倍，这是有意为之的设计决策：
 * - 在自动化代码修复场景中，一次失败修复带来的风险(代码破坏、时间浪费)
 *   远大于一次成功修复带来的增益(已知该方案可行)。
 * - 类比"损失厌恶"原则：系统应更快地淘汰低质量基因，同时给成功基因
 *   更温和的渐进式提升，避免过度集中于少数基因。
 * - 实际效果：一个基因需要连续 2 次成功才能抵消 1 次失败的影响。
 *
 * 如需调整，可通过 EpigeneticConfig 覆盖默认值。
 */
export interface EpigeneticConfig {
  successBoost?: number;
  failurePenalty?: number;
  maxBoost?: number;
  minBoost?: number;
  decayDays?: number;
  maxMarksPerEnv?: number;
}

export const EPIGENETIC_DEFAULTS: Readonly<Required<EpigeneticConfig>> = {
  successBoost: 0.05,
  failurePenalty: -0.1,
  maxBoost: 0.5,
  minBoost: -0.5,
  decayDays: 90,
  maxMarksPerEnv: 5
};

export const EPIGENETIC_SUCCESS_BOOST = EPIGENETIC_DEFAULTS.successBoost;
export const EPIGENETIC_FAILURE_PENALTY = EPIGENETIC_DEFAULTS.failurePenalty;
export const EPIGENETIC_MAX_BOOST = EPIGENETIC_DEFAULTS.maxBoost;
export const EPIGENETIC_MIN_BOOST = EPIGENETIC_DEFAULTS.minBoost;
export const EPIGENETIC_DECAY_DAYS = EPIGENETIC_DEFAULTS.decayDays;
export const EPIGENETIC_MAX_MARKS_PER_ENV = EPIGENETIC_DEFAULTS.maxMarksPerEnv;

export function hashEnvFingerprint(env: EnvFingerprint): string {
  const parts = Object.entries(env)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}:${String(value)}`);

  const input = parts.join('|');
  let hash = 5381;
  for (let index = 0; index < input.length; index++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(index);
    hash &= hash;
  }
  return `env_${Math.abs(hash).toString(36)}`;
}

function pruneMarksPerEnvironment(marks: EpigeneticMark[]): EpigeneticMark[] {
  const byEnv = new Map<string, EpigeneticMark[]>();
  for (const mark of marks) {
    byEnv.set(mark.env_hash, [...(byEnv.get(mark.env_hash) || []), mark]);
  }

  return Array.from(byEnv.values()).flatMap(envMarks =>
    envMarks
      .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
      .slice(-EPIGENETIC_MAX_MARKS_PER_ENV)
  );
}

export function applyEpigeneticMarks(
  gene: Gene,
  envFingerprint: EnvFingerprint,
  outcome: OutcomeStatus
): Gene {
  pruneExpiredMarks(gene);

  if (!gene.epigenetic_marks) {
    gene.epigenetic_marks = [];
  }

  const boost = outcome === 'success'
    ? EPIGENETIC_SUCCESS_BOOST
    : outcome === 'failed'
      ? EPIGENETIC_FAILURE_PENALTY
      : 0;

  if (boost === 0) {
    return gene;
  }

  gene.epigenetic_marks.push({
    env_hash: hashEnvFingerprint(envFingerprint),
    outcome,
    boost,
    timestamp: new Date().toISOString()
  });

  gene.epigenetic_marks = pruneMarksPerEnvironment(gene.epigenetic_marks);

  gene.metadata = {
    ...(gene.metadata || {}),
    updated_at: new Date().toISOString()
  };

  return gene;
}

export function getEpigeneticBoost(gene: Gene, envFingerprint: EnvFingerprint): number {
  if (!gene.epigenetic_marks || gene.epigenetic_marks.length === 0) {
    return 0;
  }

  const envHash = hashEnvFingerprint(envFingerprint);
  const now = Date.now();
  const decayMs = EPIGENETIC_DECAY_DAYS * 24 * 60 * 60 * 1000;
  let totalBoost = 0;

  for (const mark of gene.epigenetic_marks) {
    if (mark.env_hash !== envHash) continue;
    const markTime = new Date(mark.timestamp).getTime();
    if (now - markTime > decayMs) continue;

    const age = now - markTime;
    const decayFactor = 1 - (age / decayMs);
    totalBoost += mark.boost * decayFactor;
  }

  return Math.max(EPIGENETIC_MIN_BOOST, Math.min(EPIGENETIC_MAX_BOOST, totalBoost));
}

export function pruneExpiredMarks(gene: Gene): Gene {
  if (!gene.epigenetic_marks) {
    return gene;
  }

  const now = Date.now();
  const decayMs = EPIGENETIC_DECAY_DAYS * 24 * 60 * 60 * 1000;
  gene.epigenetic_marks = gene.epigenetic_marks.filter(mark => {
    const markTime = new Date(mark.timestamp).getTime();
    return now - markTime <= decayMs;
  });
  gene.epigenetic_marks = pruneMarksPerEnvironment(gene.epigenetic_marks);
  return gene;
}
