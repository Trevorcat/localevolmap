/**
 * Capsule Manager - 胶囊管理器
 * 
 * 负责胶囊的存储、检索、匹配和复用决策
 */

import type { Capsule, Signal, EnvFingerprint } from '../types/gene-capsule-schema';
import { matchPatternToSignals } from './gene-selector';

// ============================================================================
// 存储接口
// ============================================================================

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

// ============================================================================
// 胶囊匹配
// ============================================================================

export interface ScoredCapsule {
  capsule: Capsule;
  score: number;
  signalScore: number;
  envScore: number;
  successWeight: number;
}

/**
 * 根据信号和环境匹配最佳胶囊
 * 
 * 评分算法：
 * 1. 信号匹配得分：每个匹配的触发信号 +1 分
 * 2. 环境匹配度：平台 +2, 架构 +1, Node 版本 +1
 * 3. 成功率加权：成功 1.5x, 失败 0.5x
 * 4. 综合得分 = (信号分 + 环境分) × 置信度 × 成功权重
 */
export function selectCapsule(
  capsules: Capsule[],
  signals: Signal[],
  currentEnv: EnvFingerprint
): Capsule | undefined {
  if (capsules.length === 0) return undefined;
  
  const scored: ScoredCapsule[] = capsules.map(c => {
    // 1. 信号匹配得分
    let signalScore = 0;
    c.trigger.forEach(trigger => {
      if (matchPatternToSignals(trigger, signals)) {
        signalScore++;
      }
    });
    
    // 2. 环境匹配度
    let envScore = 0;
    if (c.env_fingerprint) {
      if (c.env_fingerprint.platform === currentEnv.platform) envScore += 2;
      if (c.env_fingerprint.arch === currentEnv.arch) envScore += 1;
      if (c.env_fingerprint.node_version === currentEnv.node_version) envScore += 1;
    }
    
    // 3. 成功率加权
    const successWeight = c.outcome.status === 'success' ? 1.5 : 
                         c.outcome.status === 'partial' ? 1.0 : 0.5;
    
    // 4. 综合得分
    const totalScore = (signalScore + envScore) * c.confidence * successWeight;
    
    return {
      capsule: c,
      score: totalScore,
      signalScore,
      envScore,
      successWeight
    };
  });
  
  // 过滤掉无信号匹配的，按得分排序
  const valid = scored
    .filter(x => x.signalScore > 0)
    .sort((a, b) => b.score - a.score);
  
  return valid.length > 0 ? valid[0].capsule : undefined;
}

/**
 * 查找所有匹配的胶囊（不选最佳）
 */
export function findMatchingCapsules(
  capsules: Capsule[],
  signals: Signal[],
  minSignalMatch: number = 1
): Capsule[] {
  return capsules.filter(c => {
    const matchCount = c.trigger.filter(t => 
      matchPatternToSignals(t, signals)
    ).length;
    return matchCount >= minSignalMatch;
  });
}

// ============================================================================
// 胶囊复用决策
// ============================================================================

export interface ReuseDecision {
  shouldReuse: boolean;
  reason: string;
  confidence: number;
}

/**
 * 决定是否复用胶囊
 * 
 * 复用条件：
 * 1. 置信度 >= 阈值（默认 0.6）
 * 2. 历史状态不是失败
 * 3. 至少 2 个信号匹配
 * 4. 环境兼容性可接受
 */
export function shouldReuseCapsule(
  capsule: Capsule,
  signals: Signal[],
  currentEnv?: EnvFingerprint,
  minConfidence: number = 0.6
): ReuseDecision {
  // 1. 置信度检查
  if (capsule.confidence < minConfidence) {
    return {
      shouldReuse: false,
      reason: `Confidence ${capsule.confidence} below threshold ${minConfidence}`,
      confidence: capsule.confidence
    };
  }
  
  // 2. 历史成功率检查
  if (capsule.outcome.status === 'failed') {
    return {
      shouldReuse: false,
      reason: 'Capsule has failed outcome history',
      confidence: 0
    };
  }
  
  // 3. 信号匹配检查
  const matchCount = capsule.trigger.filter(t => 
    matchPatternToSignals(t, signals)
  ).length;
  
  if (matchCount < 2) {
    return {
      shouldReuse: false,
      reason: `Only ${matchCount} signal matches (need >= 2)`,
      confidence: capsule.confidence * (matchCount / 2)
    };
  }
  
  // 4. 环境兼容性检查（如果提供）
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

/**
 * 环境兼容性检查
 */
export interface EnvironmentCompatibility {
  compatible: boolean;
  reason: string;
  compatibilityScore: number;
}

function checkEnvironmentCompatibility(
  capsule: Capsule,
  currentEnv: EnvFingerprint
): EnvironmentCompatibility {
  let score = 0;
  let maxScore = 0;
  
  // 平台检查（必需）
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
  
  // 架构检查（重要）
  maxScore += 2;
  if (capsule.env_fingerprint.arch === currentEnv.arch) {
    score += 2;
  } else {
    score += 1; // 部分兼容
  }
  
  // Node 版本检查（次要）
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

/**
 * 检查 Node 版本主版本是否匹配
 */
function majorVersionMatch(v1?: string, v2?: string): boolean {
  if (!v1 || !v2) return false;
  const major1 = v1.split('.')[0];
  const major2 = v2.split('.')[0];
  return major1 === major2;
}

// ============================================================================
// 胶囊统计与分析
// ============================================================================

export interface CapsuleStats {
  total: number;
  byStatus: Map<string, number>;
  byGene: Map<string, number>;
  avgConfidence: number;
  avgScore: number;
  successRate: number;
}

/**
 * 分析胶囊统计信息
 */
export function analyzeCapsules(capsules: Capsule[]): CapsuleStats {
  const byStatus = new Map<string, number>();
  const byGene = new Map<string, number>();
  let totalConfidence = 0;
  let totalScore = 0;
  let successCount = 0;
  
  capsules.forEach(c => {
    // 按状态统计
    byStatus.set(c.outcome.status, (byStatus.get(c.outcome.status) || 0) + 1);
    
    // 按基因统计
    byGene.set(c.gene, (byGene.get(c.gene) || 0) + 1);
    
    // 累计
    totalConfidence += c.confidence;
    totalScore += c.outcome.score;
    if (c.outcome.status === 'success') successCount++;
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

/**
 * 胶囊健康度评分
 */
export function calculateCapsuleHealth(capsule: Capsule): number {
  let health = 1.0;
  
  // 失败惩罚
  if (capsule.outcome.status === 'failed') {
    health *= 0.3;
  } else if (capsule.outcome.status === 'partial') {
    health *= 0.7;
  }
  
  // 置信度因子
  health *= capsule.confidence;
  
  // 影响范围惩罚（太大的影响范围可能有问题）
  if (capsule.blast_radius.files > 20) {
    health *= 0.8;
  }
  if (capsule.blast_radius.lines > 200) {
    health *= 0.9;
  }
  
  return Math.max(0, Math.min(1, health));
}
