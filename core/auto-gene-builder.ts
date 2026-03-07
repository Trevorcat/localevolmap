/**
 * Auto Gene Builder - 自动基因创建
 * 
 * 对齐原版 EvoMap/evolver 的 solidify.js 中的 buildAutoGene()
 * 当没有现有基因匹配当前信号时，自动创建一个新基因
 */

import type { Gene, Signal, Category } from '../types/gene-capsule-schema';

// ============================================================================
// 常量
// ============================================================================

/** 自动基因 ID 前缀 */
export const AUTO_GENE_PREFIX = 'gene_auto_';

// ============================================================================
// 信号到类别的映射
// ============================================================================

/**
 * 从信号推断基因类别
 * 
 * 基于信号中的关键词推断最合适的类别
 */
function inferCategory(signals: Signal[]): Category {
  const signalStr = signals.join(' ').toLowerCase();
  
  if (/error|exception|failed|crash|bug|fix|broken|错误|失败/.test(signalStr)) {
    return 'repair';
  }
  if (/slow|performance|latency|timeout|memory|cpu|性能/.test(signalStr)) {
    return 'performance';
  }
  if (/security|vulnerability|auth|permission|xss|injection|安全/.test(signalStr)) {
    return 'security';
  }
  if (/test|coverage|spec|assert|测试/.test(signalStr)) {
    return 'test';
  }
  if (/refactor|cleanup|debt|duplicate|重构/.test(signalStr)) {
    return 'refactor';
  }
  if (/optimize|improve|enhance|优化/.test(signalStr)) {
    return 'optimize';
  }
  if (/feature|add|new|create|implement|功能|新增/.test(signalStr)) {
    return 'feature';
  }
  
  // 默认类别
  return 'repair';
}

/**
 * 生成基于信号的默认策略
 */
function generateDefaultStrategy(signals: Signal[], category: Category): string[] {
  const baseStrategy = [
    '从当前信号中提取问题模式',
    '分析相关文件和代码上下文',
    '应用最小可逆变更'
  ];
  
  const categoryStrategy: Record<Category, string[]> = {
    repair: [
      '定位错误根因',
      '编写修复补丁',
      '验证错误不再复现'
    ],
    performance: [
      '识别性能瓶颈',
      '应用针对性优化',
      '验证性能改善指标'
    ],
    security: [
      '识别安全漏洞',
      '应用安全补丁',
      '验证漏洞已修复'
    ],
    test: [
      '分析测试覆盖缺口',
      '编写缺失的测试用例',
      '确保测试全部通过'
    ],
    refactor: [
      '识别需要重构的代码',
      '应用重构变更',
      '验证行为未改变'
    ],
    optimize: [
      '分析优化空间',
      '应用优化策略',
      '验证优化效果'
    ],
    feature: [
      '理解新功能需求',
      '实现最小功能版本',
      '验证功能正确性'
    ]
  };
  
  return [...baseStrategy, ...categoryStrategy[category]];
}

// ============================================================================
// 核心函数
// ============================================================================

export interface BuildAutoGeneOptions {
  /** 当前触发信号 */
  signals: Signal[];
  /** 用户意图描述 (可选) */
  intent?: string;
}

/**
 * 自动构建基因
 * 
 * 当基因选择器找不到匹配的基因时调用
 * 从当前信号自动推断类别、策略和约束
 * 
 * @param opts 构建选项
 * @returns 新创建的基因
 */
export function buildAutoGene(opts: BuildAutoGeneOptions): Gene {
  const { signals, intent } = opts;
  
  const category = inferCategory(signals);
  const id = `${AUTO_GENE_PREFIX}${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  const strategy = generateDefaultStrategy(signals, category);
  if (intent) {
    strategy.unshift(`用户意图: ${intent}`);
  }
  
  const gene: Gene = {
    type: 'Gene',
    id,
    category,
    signals_match: signals.slice(0, 10), // 取前10个信号作为匹配模式
    preconditions: [`Auto-generated from signals: ${signals.slice(0, 3).join(', ')}`],
    strategy,
    constraints: {
      max_files: 10,
      max_lines: 200,
      forbidden_paths: ['.git', 'node_modules', 'dist', 'build'],
      timeout_ms: 60000
    },
    metadata: {
      author: 'auto-gene-builder',
      created_at: new Date().toISOString(),
      version: '1.0.0',
      description: `Auto-generated ${category} gene from unmatched signals`,
      tags: ['auto-generated', category, ...signals.slice(0, 3)]
    }
  };
  
  return gene;
}

/**
 * 检查基因是否是自动生成的
 */
export function isAutoGene(gene: Gene): boolean {
  return gene.id.startsWith(AUTO_GENE_PREFIX);
}
