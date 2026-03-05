/**
 * Gene Selector - 基因选择算法
 * 
 * 基于群体遗传学原理，实现探索/利用平衡的选择机制
 */

import type { Gene, SelectionOptions, SelectionResult, Signal } from '../types/gene-capsule-schema';

/**
 * 计算漂移强度
 * 
 * 群体遗传学中的"遗传漂移"概念：
 * - 小群体：漂强度高 → 更多探索（避免局部最优）
 * - 大群体：漂移低 → 更多利用（收敛到最优解）
 * 
 * @param opts 选择配置
 * @returns 漂移强度 (0-1)
 */
export function computeDriftIntensity(opts: SelectionOptions): number {
  const effectivePopulationSize = opts.effectivePopulationSize || opts.genePoolSize || 1;
  
  if (opts.driftEnabled) {
    // 显式启用漂移：中等到高强度
    return effectivePopulationSize > 1 
      ? Math.min(1, 1 / Math.sqrt(effectivePopulationSize) + 0.3) 
      : 0.7;
  }
  
  // 群体依赖漂移：
  // Ne=1: intensity=1.0 (纯漂移，完全随机)
  // Ne=4: intensity=0.5 (平衡)
  // Ne=25: intensity=0.2 (低漂移，偏向最优)
  return Math.min(1, 1 / Math.sqrt(effectivePopulationSize));
}

/**
 * 多语言信号匹配
 * 
 * 支持格式："error|错误 | エラー"
 * 任意分支匹配即命中
 * 
 * @param pattern 匹配模式
 * @param signals 信号列表
 * @returns 是否匹配
 */
export function matchPatternToSignals(pattern: string, signals: Signal[]): boolean {
  const patternLower = pattern.toLowerCase();
  
  if (patternLower.includes('|')) {
    // 多语言别名模式
    const branches = patternLower.split('|').map(b => b.trim());
    return branches.some(needle => 
      signals.some(s => s.toLowerCase().includes(needle))
    );
  }
  
  // 简单包含匹配
  return signals.some(s => s.toLowerCase().includes(patternLower));
}

/**
 * 信号匹配评分器
 */
interface ScoredGene {
  gene: Gene;
  score: number;
  matchedSignals: Signal[];
}

/**
 * 为基因列表评分
 */
function scoreGenes(genes: Gene[], signals: Signal[]): ScoredGene[] {
  return genes.map(gene => {
    const matchedSignals: Signal[] = [];
    
    const score = gene.signals_match.reduce((acc, pattern) => {
      if (matchPatternToSignals(pattern, signals)) {
        const matchingSignals = signals.filter(s => 
          pattern.split('|').some(p => s.toLowerCase().includes(p.trim().toLowerCase()))
        );
        matchedSignals.push(...matchingSignals);
        return acc + 1;
      }
      return acc;
    }, 0);
    
    return { gene, score, matchedSignals: [...new Set(matchedSignals)] };
  });
}

/**
 * 根据信号选择最佳基因
 * 
 * 算法流程：
 * 1. 为所有基因评分（基于信号匹配数）
 * 2. 过滤掉无匹配的基因
 * 3. 按分数降序排序
 * 4. 根据漂移强度决定选择策略
 * 
 * @param genes 可用基因池
 * @param signals 当前信号
 * @param opts 选择配置
 * @returns 选择结果（选中基因 + 替代选项 + 评分详情）
 */
export function selectGene(
  genes: Gene[],
  signals: Signal[],
  opts: SelectionOptions = {}
): SelectionResult<Gene> {
  if (genes.length === 0) {
    throw new Error('Gene pool is empty');
  }
  
  if (signals.length === 0) {
    throw new Error('No signals provided for gene selection');
  }
  
  // 1. 评分并过滤
  const scored = scoreGenes(genes, signals)
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  
  if (scored.length === 0) {
    throw new Error(`No matching genes found for signals: ${signals.join(', ')}`);
  }
  
  // 2. 计算漂移强度
  const driftIntensity = computeDriftIntensity(opts);
  
  // 3. 选择策略
  let selectedIdx = 0;
  
  if (driftIntensity > 0 && scored.length > 1) {
    // 有漂移且有多于一个选项
    if (Math.random() < driftIntensity) {
      // 在 top-N 中随机选择
      const topN = Math.min(
        scored.length, 
        Math.ceil(scored.length * driftIntensity)
      );
      selectedIdx = Math.floor(Math.random() * topN);
    }
    // else: 选择最优 (idx=0)
  }
  
  // 4. 构建评分详情
  const allScores = new Map<string, number>();
  scored.forEach(({ gene, score }) => allScores.set(gene.id, score));
  
  return {
    selected: scored[selectedIdx].gene,
    alternatives: scored
      .slice(1, (opts.alternativesCount || 5) + 1)
      .map(s => s.gene),
    scoring: {
      selected_score: scored[selectedIdx].score,
      all_scores: allScores
    }
  };
}

/**
 * 按类别过滤基因
 */
export function filterGenesByCategory(genes: Gene[], categories: string[]): Gene[] {
  return genes.filter(g => categories.includes(g.category));
}

/**
 * 基因池统计信息
 */
export interface GenePoolStats {
  total: number;
  byCategory: Map<string, number>;
  avgSignalsPerGene: number;
  mostCommonSignals: Map<string, number>;
}

/**
 * 分析基因池统计信息
 */
export function analyzeGenePool(genes: Gene[]): GenePoolStats {
  const byCategory = new Map<string, number>();
  const signalFrequency = new Map<string, number>();
  let totalSignals = 0;
  
  genes.forEach(gene => {
    // 按类别统计
    byCategory.set(gene.category, (byCategory.get(gene.category) || 0) + 1);
    
    // 信号频率统计
    gene.signals_match.forEach(pattern => {
      pattern.split('|').forEach(branch => {
        const sig = branch.trim().toLowerCase();
        signalFrequency.set(sig, (signalFrequency.get(sig) || 0) + 1);
      });
      totalSignals++;
    });
  });
  
  // 最常用的信号
  const mostCommonSignals = new Map(
    [...signalFrequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
  );
  
  return {
    total: genes.length,
    byCategory,
    avgSignalsPerGene: genes.length > 0 ? totalSignals / genes.length : 0,
    mostCommonSignals
  };
}
