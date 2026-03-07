/**
 * Skill Distiller - 技能蒸馏器
 *
 * 对齐原版 EvoMap/evolver 的 skillDistiller.js
 * 从累积的成功胶囊中蒸馏出新的基因模式
 *
 * 两阶段流程：
 * 1. prepareDistillation() — 收集数据、分析模式、生成 LLM 提示
 * 2. completeDistillation() — 验证 LLM 返回的基因、保存
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Gene, Capsule, Signal, DistillationRequest, DistillationResult } from '../types/gene-capsule-schema';
import { DISTILLED_PREFIX, computeSignalOverlap, matchPatternToSignals } from './gene-selector';

// ============================================================================
// 常量 (对齐原版 EvoMap)
// ============================================================================

/** 蒸馏器环境变量开关 */
export const SKILL_DISTILLER_ENV_KEY = 'SKILL_DISTILLER';

/** 最小胶囊总数 */
export const DISTILLER_MIN_CAPSULES = 10;

/** 最小间隔小时数 */
export const DISTILLER_INTERVAL_HOURS = 24;

/** 最近 N 个胶囊中的最低成功率 */
export const DISTILLER_MIN_SUCCESS_RATE = 0.7;

/** 最近胶囊窗口大小 */
export const DISTILLER_RECENT_WINDOW = 10;

/** 蒸馏基因最大文件数约束 */
export const DISTILLED_MAX_FILES = 12;

/** 高频基因阈值 (胶囊数 >= 此值视为高频) */
export const HIGH_FREQUENCY_THRESHOLD = 5;

/** 策略漂移 Jaccard 相似度阈值 (低于此值视为漂移) */
export const STRATEGY_DRIFT_THRESHOLD = 0.6;

/** 信号覆盖缺口阈值 (出现次数 >= 此值但无基因覆盖) */
export const COVERAGE_GAP_THRESHOLD = 3;

// ============================================================================
// 蒸馏状态追踪
// ============================================================================

export interface DistillationState {
  lastDistillationTime: number;
}

const globalDistillationState: DistillationState = { lastDistillationTime: 0 };

/**
 * 重置蒸馏状态 (用于测试)
 */
export function resetDistillationState(state: DistillationState = globalDistillationState): void {
  state.lastDistillationTime = 0;
}

// ============================================================================
// Gate Check - 是否应该蒸馏
// ============================================================================

/**
 * 判断是否应该执行蒸馏
 *
 * 条件 (全部满足才蒸馏):
 * 1. SKILL_DISTILLER 环境变量未被显式关闭
 * 2. 距上次蒸馏 >= 24 小时
 * 3. 成功胶囊总数 >= 10
 * 4. 最近 10 个胶囊中成功率 >= 70%
 */
export function shouldDistill(
  capsules: Capsule[],
  state: DistillationState = globalDistillationState,
  now: number = Date.now()
): boolean {
  // 1. 环境变量检查
  const envVal = process.env[SKILL_DISTILLER_ENV_KEY];
  if (envVal === 'false' || envVal === '0') {
    return false;
  }

  // 2. 间隔检查
  const intervalMs = DISTILLER_INTERVAL_HOURS * 60 * 60 * 1000;
  if (now - state.lastDistillationTime < intervalMs) {
    return false;
  }

  // 3. 成功胶囊总数
  const activeCapsules = capsules.filter(c => !c._deleted);
  const successCapsules = activeCapsules.filter(c => c.outcome.status === 'success');
  if (successCapsules.length < DISTILLER_MIN_CAPSULES) {
    return false;
  }

  // 4. 最近成功率
  const sorted = [...activeCapsules].sort((a, b) => {
    const timeA = a.metadata?.created_at ? new Date(a.metadata.created_at).getTime() : 0;
    const timeB = b.metadata?.created_at ? new Date(b.metadata.created_at).getTime() : 0;
    return timeB - timeA;
  });

  const recent = sorted.slice(0, DISTILLER_RECENT_WINDOW);
  const recentSuccessRate = recent.filter(c => c.outcome.status === 'success').length / recent.length;

  return recentSuccessRate >= DISTILLER_MIN_SUCCESS_RATE;
}

// ============================================================================
// 数据收集
// ============================================================================

export interface DistillationData {
  /** 按基因分组的成功胶囊 */
  byGene: Map<string, {
    capsules: Capsule[];
    avgScore: number;
    triggers: Signal[];
  }>;
  /** 总成功胶囊数 */
  totalSuccess: number;
  /** 总胶囊数 */
  totalCapsules: number;
}

/**
 * 收集蒸馏所需数据
 *
 * 将成功胶囊按关联基因分组，计算统计信息
 */
export function collectDistillationData(capsules: Capsule[]): DistillationData {
  const activeCapsules = capsules.filter(c => !c._deleted);
  const successCapsules = activeCapsules.filter(c => c.outcome.status === 'success');

  const byGene = new Map<string, { capsules: Capsule[]; avgScore: number; triggers: Signal[] }>();

  for (const capsule of successCapsules) {
    const geneId = capsule.gene;
    const existing = byGene.get(geneId) || { capsules: [], avgScore: 0, triggers: [] };
    existing.capsules.push(capsule);
    existing.triggers.push(...capsule.trigger);
    byGene.set(geneId, existing);
  }

  // 计算每个基因的平均分
  for (const [, data] of byGene) {
    data.avgScore = data.capsules.reduce((sum, c) => sum + c.outcome.score, 0) / data.capsules.length;
  }

  return {
    byGene,
    totalSuccess: successCapsules.length,
    totalCapsules: activeCapsules.length
  };
}

// ============================================================================
// 模式分析
// ============================================================================

export interface PatternAnalysis {
  /** 高频基因 (>=5 个胶囊) */
  highFrequencyGenes: Array<{ geneId: string; count: number; avgScore: number }>;
  /** 策略漂移 (Jaccard < 0.6) */
  strategyDrifts: Array<{ geneId: string; jaccardSimilarity: number }>;
  /** 覆盖缺口 (信号出现 >=3 次但无基因覆盖) */
  coverageGaps: string[];
}

/**
 * 分析蒸馏数据中的模式
 */
export function analyzePatterns(
  data: DistillationData,
  existingGenes: Gene[]
): PatternAnalysis {
  // 1. 高频基因
  const highFrequencyGenes: PatternAnalysis['highFrequencyGenes'] = [];
  for (const [geneId, geneData] of data.byGene) {
    if (geneData.capsules.length >= HIGH_FREQUENCY_THRESHOLD) {
      highFrequencyGenes.push({
        geneId,
        count: geneData.capsules.length,
        avgScore: geneData.avgScore
      });
    }
  }
  highFrequencyGenes.sort((a, b) => b.count - a.count);

  // 2. 策略漂移: 对每个高频基因，比较其胶囊间的策略一致性
  const strategyDrifts: PatternAnalysis['strategyDrifts'] = [];
  for (const hfGene of highFrequencyGenes) {
    const geneData = data.byGene.get(hfGene.geneId)!;
    // 取第一个和最后一个胶囊的触发信号做 Jaccard
    if (geneData.capsules.length >= 2) {
      const sortedCapsules = [...geneData.capsules].sort((left, right) => {
        const leftTime = left.metadata?.created_at ? new Date(left.metadata.created_at).getTime() : 0;
        const rightTime = right.metadata?.created_at ? new Date(right.metadata.created_at).getTime() : 0;
        return leftTime - rightTime;
      });
      let jaccard = 1;
      for (let index = 1; index < sortedCapsules.length; index++) {
        const similarity = computeSignalOverlap(sortedCapsules[index - 1].trigger, sortedCapsules[index].trigger);
        jaccard = Math.min(jaccard, similarity);
      }
      if (jaccard < STRATEGY_DRIFT_THRESHOLD) {
        strategyDrifts.push({ geneId: hfGene.geneId, jaccardSimilarity: jaccard });
      }
    }
  }

  // 3. 覆盖缺口: 统计所有触发信号的频率，找出无基因覆盖的高频信号
  const signalFrequency = new Map<string, number>();
  for (const [, geneData] of data.byGene) {
    for (const trigger of geneData.triggers) {
      const lower = trigger.toLowerCase();
      signalFrequency.set(lower, (signalFrequency.get(lower) || 0) + 1);
    }
  }

  const coverageGaps: string[] = [];
  for (const [signal, count] of signalFrequency) {
    const covered = existingGenes.some(gene =>
      gene.signals_match.some(pattern => matchPatternToSignals(pattern, [signal]))
    );
    if (count >= COVERAGE_GAP_THRESHOLD && !covered) {
      coverageGaps.push(signal);
    }
  }

  return { highFrequencyGenes, strategyDrifts, coverageGaps };
}

// ============================================================================
// 提示构建
// ============================================================================

/**
 * 构建蒸馏提示
 *
 * 生成发送给 LLM 的提示文本，包含:
 * - 模式分析结果
 * - 样本胶囊
 * - 现有基因列表
 * - 输出格式要求
 */
export function buildDistillationPrompt(
  analysis: PatternAnalysis,
  data: DistillationData,
  existingGenes: Gene[]
): string {
  let prompt = '# Gene Distillation Task\n\n';
  prompt += 'You are a gene synthesis engine. Based on accumulated capsule data and pattern analysis, ';
  prompt += 'synthesize a NEW gene that captures an emergent pattern not covered by existing genes.\n\n';

  // 模式分析
  prompt += '## Pattern Analysis\n\n';

  if (analysis.highFrequencyGenes.length > 0) {
    prompt += '### High-Frequency Genes\n';
    for (const hf of analysis.highFrequencyGenes) {
      prompt += `- ${hf.geneId}: ${hf.count} capsules, avg score ${hf.avgScore.toFixed(2)}\n`;
    }
    prompt += '\n';
  }

  if (analysis.strategyDrifts.length > 0) {
    prompt += '### Strategy Drifts (low consistency between capsules)\n';
    for (const drift of analysis.strategyDrifts) {
      prompt += `- ${drift.geneId}: Jaccard similarity ${drift.jaccardSimilarity.toFixed(2)}\n`;
    }
    prompt += '\n';
  }

  if (analysis.coverageGaps.length > 0) {
    prompt += `### Coverage Gaps (signals appearing ${COVERAGE_GAP_THRESHOLD}+ times with no gene coverage)\n`;
    prompt += analysis.coverageGaps.map(s => `- ${s}`).join('\n') + '\n\n';
  }

  // 样本胶囊
  prompt += '## Sample Capsules (top 5 by score)\n\n';
  const allCapsules: Capsule[] = [];
  for (const [, geneData] of data.byGene) {
    allCapsules.push(...geneData.capsules);
  }
  const topCapsules = allCapsules
    .sort((a, b) => b.outcome.score - a.outcome.score)
    .slice(0, 5);

  for (const cap of topCapsules) {
    prompt += `- ID: ${cap.id}, Gene: ${cap.gene}, Triggers: [${cap.trigger.join(', ')}], `;
    prompt += `Score: ${cap.outcome.score}, Summary: ${cap.summary}\n`;
  }
  prompt += '\n';

  // 现有基因
  prompt += `## Existing Genes (${existingGenes.length} total)\n\n`;
  for (const gene of existingGenes.slice(0, 20)) {
    prompt += `- ${gene.id} (${gene.category}): signals=[${gene.signals_match.slice(0, 5).join(', ')}]\n`;
  }
  prompt += '\n';

  // 输出格式
  prompt += '## Output Requirements\n\n';
  prompt += 'Synthesize ONE new gene as a JSON object with these exact fields:\n';
  prompt += '```json\n';
  prompt += `{
  "type": "Gene",
  "id": "${DISTILLED_PREFIX}<descriptive_name>",
  "category": "repair|optimize|feature|security|performance|refactor|test",
  "signals_match": ["signal1", "signal2"],
  "preconditions": ["condition1"],
  "strategy": ["step1", "step2", "step3"],
  "constraints": {
    "max_files": 12,
    "max_lines": 200,
    "forbidden_paths": [".git", "node_modules"]
  },
  "validation": ["npm test"],
  "metadata": {
    "author": "skill-distiller",
    "description": "What this gene does"
  }
}\n`;
  prompt += '```\n\n';
  prompt += 'Rules:\n';
  prompt += `- ID MUST start with "${DISTILLED_PREFIX}"\n`;
  prompt += `- max_files MUST be <= ${DISTILLED_MAX_FILES}\n`;
  prompt += '- forbidden_paths MUST include ".git" and "node_modules"\n';
  prompt += '- signals_match MUST NOT overlap significantly with existing genes\n';
  prompt += '- Focus on the coverage gaps and strategy drifts identified above\n';
  prompt += '- Return ONLY the JSON object, no markdown wrapping\n';

  return prompt;
}

// ============================================================================
// 验证
// ============================================================================

/**
 * 验证 LLM 合成的基因
 *
 * 检查:
 * 1. ID 以 gene_distilled_ 开头
 * 2. max_files <= 12
 * 3. forbidden_paths 包含 .git 和 node_modules
 * 4. 信号不与现有基因严重重叠
 */
export function validateSynthesizedGene(
  gene: any,
  existingGenes: Gene[]
): DistillationResult {
  const validation = {
    idValid: false,
    maxFilesValid: false,
    forbiddenPathsValid: false,
    signalOverlapCheck: false,
    structureValid: false
  };

  const validCategories = ['repair', 'optimize', 'feature', 'security', 'performance', 'refactor', 'test'];
  const structureErrors: string[] = [];

  // 1. ID 检查
  if (typeof gene?.id === 'string' && gene.id.startsWith(DISTILLED_PREFIX)) {
    validation.idValid = true;
  }

  // 2. max_files 检查
  const maxFiles = gene?.constraints?.max_files;
  if (typeof maxFiles === 'number' && maxFiles <= DISTILLED_MAX_FILES) {
    validation.maxFilesValid = true;
  } else if (maxFiles === undefined) {
    // 没设置也算合法，给个默认值
    if (gene.constraints) {
      gene.constraints.max_files = DISTILLED_MAX_FILES;
    }
    validation.maxFilesValid = true;
  }

  // 3. forbidden_paths 检查
  const forbiddenPaths = gene?.constraints?.forbidden_paths;
  if (Array.isArray(forbiddenPaths) &&
      forbiddenPaths.includes('.git') &&
      forbiddenPaths.includes('node_modules')) {
    validation.forbiddenPathsValid = true;
  }

  // 4. 信号重叠检查
  const newSignals = gene?.signals_match || [];
  let maxOverlap = 0;
  for (const existing of existingGenes) {
    const overlap = computeSignalOverlap(newSignals, existing.signals_match);
    maxOverlap = Math.max(maxOverlap, overlap);
  }
  // 允许最多 50% 重叠
  validation.signalOverlapCheck = maxOverlap <= 0.5;

  if (!Array.isArray(gene?.signals_match) || gene.signals_match.length === 0) {
    structureErrors.push('signals_match must be a non-empty array');
  }
  if (!Array.isArray(gene?.strategy) || gene.strategy.length === 0) {
    structureErrors.push('strategy must be a non-empty array');
  }
  if (!validCategories.includes(gene?.category)) {
    structureErrors.push(`category must be one of: ${validCategories.join(', ')}`);
  }
  validation.structureValid = structureErrors.length === 0;

  const allValid = validation.idValid && validation.maxFilesValid &&
                   validation.forbiddenPathsValid && validation.signalOverlapCheck && validation.structureValid;

  if (!allValid) {
    const errors: string[] = [];
    if (!validation.idValid) errors.push(`ID must start with "${DISTILLED_PREFIX}"`);
    if (!validation.maxFilesValid) errors.push(`max_files must be <= ${DISTILLED_MAX_FILES}`);
    if (!validation.forbiddenPathsValid) errors.push('forbidden_paths must include .git and node_modules');
    if (!validation.signalOverlapCheck) errors.push(`Signal overlap too high (${(maxOverlap * 100).toFixed(0)}%)`);
    errors.push(...structureErrors);

    return {
      success: false,
      error: errors.join('; '),
      validation
    };
  }

  // 补充完整基因字段
  const validGene: Gene = {
    type: 'Gene',
    id: gene.id,
    category: gene.category || 'repair',
    signals_match: gene.signals_match || [],
    preconditions: gene.preconditions || [],
    strategy: gene.strategy || [],
    constraints: gene.constraints || {},
    validation: gene.validation,
    metadata: {
      ...gene.metadata,
      author: 'skill-distiller',
      created_at: new Date().toISOString(),
      version: '1.0.0'
    },
    _distilled_meta: {
      source_capsule_ids: [],
      distilled_at: new Date().toISOString(),
      pattern_summary: gene.metadata?.description || 'Distilled from capsule patterns'
    }
  };

  return {
    success: true,
    gene: validGene,
    validation
  };
}

// ============================================================================
// 两阶段蒸馏流程
// ============================================================================

/**
 * 阶段 1: 准备蒸馏
 *
 * 收集数据、分析模式、生成提示文件
 *
 * @param capsules 所有胶囊
 * @param genes 所有基因
 * @param outputDir 提示文件输出目录
 * @returns 蒸馏请求信息
 */
export async function prepareDistillation(
  capsules: Capsule[],
  genes: Gene[],
  outputDir: string,
  options: { state?: DistillationState; now?: number } = {}
): Promise<DistillationRequest | null> {
  const state = options.state || globalDistillationState;
  if (!shouldDistill(capsules, state, options.now)) {
    return null;
  }

  const data = collectDistillationData(capsules);
  const analysis = analyzePatterns(data, genes);
  const prompt = buildDistillationPrompt(analysis, data, genes);

  // 写入提示文件
  await fs.mkdir(outputDir, { recursive: true });
  const promptFilePath = path.join(outputDir, `distill-prompt-${Date.now()}.md`);
  await fs.writeFile(promptFilePath, prompt, 'utf-8');

  // 更新蒸馏时间
  state.lastDistillationTime = options.now ?? Date.now();

  const topGenes = analysis.highFrequencyGenes.map(hf => ({
    geneId: hf.geneId,
    count: hf.count,
    avgScore: hf.avgScore
  }));

  return {
    promptFilePath,
    dataSummary: {
      totalCapsules: data.totalCapsules,
      successRate: data.totalCapsules > 0 ? data.totalSuccess / data.totalCapsules : 0,
      topGenes,
      coverageGaps: analysis.coverageGaps,
      strategyDrifts: analysis.strategyDrifts
    }
  };
}

/**
 * 阶段 2: 完成蒸馏
 *
 * 接收 LLM 的响应文本，验证并返回结果
 *
 * @param responseText LLM 返回的 JSON 文本
 * @param existingGenes 现有基因列表 (用于重叠检查)
 * @param sourceCapsuleIds 源胶囊 ID 列表 (用于追踪)
 * @returns 蒸馏结果
 */
export function completeDistillation(
  responseText: string,
  existingGenes: Gene[],
  sourceCapsuleIds: string[] = []
): DistillationResult {
  // 从 LLM 响应中提取 JSON
  let parsed: any;
  try {
    parsed = extractJsonFromResponse(responseText);
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse LLM response: ${(error as Error).message}`
    };
  }

  // 验证
  const result = validateSynthesizedGene(parsed, existingGenes);

  // 补充源胶囊 ID
  if (result.success && result.gene && result.gene._distilled_meta) {
    result.gene._distilled_meta.source_capsule_ids = sourceCapsuleIds;
  }

  return result;
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 从 LLM 响应中提取 JSON 对象
 *
 * 处理:
 * 1. 纯 JSON
 * 2. markdown 代码块包裹
 * 3. 前后有文本描述
 */
export function extractJsonFromResponse(text: string): any {
  const trimmed = text.trim();

  // 1. 尝试直接解析
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  // 2. markdown 代码块
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim());
  }

  // 3. 找第一个 { 到最后一个 }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  throw new Error('No JSON object found in response');
}
