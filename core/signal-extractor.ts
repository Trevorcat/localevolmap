/**
 * Signal Extractor - 信号提取引擎
 * 
 * 从运行时日志和历史中提取结构化信号
 * 用于驱动基因选择和进化决策
 */

import type { Signal, EvolutionEvent } from '../types/gene-capsule-schema';

// ============================================================================
// 类型定义
// ============================================================================

export interface LogEntry {
  type: 'tool_result' | 'user_input' | 'agent_output' | 'system' | 'error';
  error?: {
    code?: string;
    message: string;
    stack?: string;
  };
  latency?: number;
  user_input?: string;
  content?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface SignalContext {
  logs: LogEntry[];
  history?: EvolutionEvent[];
}

export interface ExtractedSignals {
  signals: Signal[];
  prioritySignals: Signal[];
  rawSignals: Signal[];
}

// ============================================================================
// 信号提取
// ============================================================================

/**
 * 从日志和历史中提取信号
 * 
 * 信号类别：
 * - 错误信号：log_error, errsig:{signature}, error_code:{code}
 * - 性能信号：perf_bottleneck, perf_critical
 * - 用户请求：user_feature_request, user_bug_report
 * - 系统信号：system_timeout, memory_pressure
 * - 模式信号：recurring_failures
 */
export function extractSignals(context: SignalContext): ExtractedSignals {
  const rawSignals: Signal[] = [];
  
  // 1. 从日志中提取
  context.logs.forEach(entry => {
    extractFromLogEntry(entry, rawSignals);
  });
  
  // 2. 从历史中提取模式信号
  if (context.history) {
    extractPatternSignals(context.history, rawSignals);
  }
  
  // 3. 去重
  const signals = [...new Set(rawSignals)];
  
  // 4. 优先级排序
  const prioritySignals = prioritizeSignals(signals);
  
  return {
    signals,
    prioritySignals,
    rawSignals
  };
}

/**
 * 从单条日志提取信号
 */
function extractFromLogEntry(entry: LogEntry, signals: Signal[]): void {
  // 错误信号
  if (entry.type === 'tool_result' && entry.error) {
    signals.push('log_error');
    
    // 精确错误签名（截断到 200 字符）
    const errorSig = JSON.stringify(entry.error).slice(0, 200);
    signals.push(`errsig:${errorSig}`);
    
    // 特定错误代码
    if (entry.error.code) {
      signals.push(`error_code:${entry.error.code}`);
    }
    
    // 错误消息关键词
    extractErrorMessageSignals(entry.error.message, signals);
  }
  
  // 性能信号
  if (entry.latency) {
    if (entry.latency > 10000) {
      signals.push('perf_critical');
    } else if (entry.latency > 5000) {
      signals.push('perf_bottleneck');
    }
  }
  
  // 用户输入信号
  if (entry.user_input) {
    extractUserInputSignals(entry.user_input, signals);
  }
  
  // 系统级信号
  if (entry.type === 'system' && entry.content) {
    extractSystemSignals(entry.content, signals);
  }
  
  // 错误类型日志
  if (entry.type === 'error') {
    signals.push('system_error');
    if (entry.content) {
      signals.push(`error_msg:${entry.content.slice(0, 100)}`);
    }
  }
}

/**
 * 从错误消息提取关键词信号
 */
function extractErrorMessageSignals(message: string, signals: Signal[]): void {
  const messageLower = message.toLowerCase();
  
  const errorPatterns: Record<string, Signal> = {
    'undefined': 'error_undefined',
    'null': 'error_null',
    'timeout': 'error_timeout',
    'permission': 'error_permission',
    'not found': 'error_not_found',
    'syntax': 'error_syntax',
    'type error': 'error_type',
    'connection': 'error_connection',
    'memory': 'error_memory',
    'stack overflow': 'error_stack',
    'circular': 'error_circular',
    'duplicate': 'error_duplicate',
    'validation': 'error_validation',
    'authentication': 'error_auth',
    'authorization': 'error_authz'
  };
  
  for (const [pattern, signal] of Object.entries(errorPatterns)) {
    if (messageLower.includes(pattern)) {
      signals.push(signal);
    }
  }
}

/**
 * 从用户输入提取信号
 */
function extractUserInputSignals(input: string, signals: Signal[]): void {
  const inputLower = input.toLowerCase();
  
  // 功能请求
  if (/feature|improvement|add|new|implement|create/i.test(inputLower)) {
    signals.push('user_feature_request');
  }
  
  // 问题报告
  if (/bug|fix|broken|doesn't work|not working|problem|issue/i.test(inputLower)) {
    signals.push('user_bug_report');
  }
  
  // 性能关注
  if (/slow|fast|performance|optimize|speed|efficient/i.test(inputLower)) {
    signals.push('performance_concern');
  }
  
  // 安全关注
  if (/security|vulnerabilit|secure|hack|exploit/i.test(inputLower)) {
    signals.push('security_concern');
  }
  
  // 重构请求
  if (/refactor|clean|restructure|rewrite/i.test(inputLower)) {
    signals.push('refactor_request');
  }
  
  // 测试相关
  if (/test|spec|e2e|integration|unit/i.test(inputLower)) {
    signals.push('testing_concern');
  }
}

/**
 * 从系统内容提取信号
 */
function extractSystemSignals(content: string, signals: Signal[]): void {
  const contentLower = content.toLowerCase();
  
  if (contentLower.includes('timeout')) {
    signals.push('system_timeout');
  }
  if (contentLower.includes('memory') || contentLower.includes('heap')) {
    signals.push('memory_pressure');
  }
  if (contentLower.includes('cpu') || contentLower.includes('overload')) {
    signals.push('cpu_pressure');
  }
  if (contentLower.includes('disk') || contentLower.includes('storage')) {
    signals.push('disk_pressure');
  }
  if (contentLower.includes('network') || contentLower.includes('connection')) {
    signals.push('network_issue');
  }
}

/**
 * 从历史中提取模式信号
 */
function extractPatternSignals(history: EvolutionEvent[], signals: Signal[]): void {
  if (history.length < 5) return;
  
  // 近期失败统计
  const recentFailures = history
    .slice(-10)
    .filter(e => e.outcome.status === 'failed').length;
  
  if (recentFailures > 5) {
    signals.push('recurring_failures');
  }
  
  // 成功率趋势
  const recentEvents = history.slice(-20);
  const successRate = recentEvents.filter(e => e.outcome.status === 'success').length / recentEvents.length;
  
  if (successRate < 0.3) {
    signals.push('low_success_rate');
  } else if (successRate > 0.8) {
    signals.push('high_success_rate');
  }
  
  // 频繁使用的基因
  const geneFrequency = new Map<string, number>();
  history.forEach(e => {
    geneFrequency.set(e.selected_gene, (geneFrequency.get(e.selected_gene) || 0) + 1);
  });
  
  const mostUsedGene = Array.from(geneFrequency.entries())
    .sort((a, b) => b[1] - a[1])[0];
  
  if (mostUsedGene && mostUsedGene[1] > 5) {
    signals.push(`frequent_gene:${mostUsedGene[0]}`);
  }
}

// ============================================================================
// 信号优先级
// ============================================================================

/**
 * 信号优先级排序
 * 
 * 优先级顺序：
 * 1. 错误信号（最高优先级）
 * 2. 性能危急信号
 * 3. 用户请求信号
 * 4. 系统压力信号
 * 5. 模式信号
 */
export function prioritizeSignals(signals: Signal[]): Signal[] {
  const priorityOrder: Signal[] = [
    // 错误信号（最高）
    'log_error', 'system_error',
    'error_timeout', 'error_memory', 'error_stack',
    
    // 性能危急
    'perf_critical', 'perf_bottleneck',
    
    // 用户请求
    'user_bug_report', 'user_feature_request',
    'security_concern', 'performance_concern',
    
    // 系统压力
    'system_timeout', 'memory_pressure', 'cpu_pressure', 'disk_pressure',
    
    // 模式信号
    'recurring_failures', 'low_success_rate', 'high_success_rate'
  ];
  
  return signals.sort((a, b) => {
    const aIdx = priorityOrder.indexOf(a);
    const bIdx = priorityOrder.indexOf(b);
    
    // 都在优先级列表中
    if (aIdx !== -1 && bIdx !== -1) {
      return aIdx - bIdx;
    }
    
    // 只有 a 在
    if (aIdx !== -1) return -1;
    
    // 只有 b 在
    if (bIdx !== -1) return 1;
    
    // 都不在，按信号类型分组
    return signalTypePriority(a) - signalTypePrefix(b);
  });
}

/**
 * 根据信号前缀计算优先级
 */
function signalTypePriority(signal: Signal): number {
  if (signal.startsWith('errsig:')) return 100;
  if (signal.startsWith('error_code:')) return 101;
  if (signal.startsWith('error_msg:')) return 102;
  if (signal.startsWith('error_')) return 103;
  if (signal.startsWith('perf_')) return 200;
  if (signal.startsWith('user_')) return 300;
  if (signal.startsWith('system_')) return 400;
  if (signal.startsWith('frequent_')) return 500;
  return 999;
}

function signalTypePrefix(signal: Signal): number {
  // 简化版，实际应调用 signalTypePriority
  return signalTypePriority(signal);
}

// ============================================================================
// 信号分析工具
// ============================================================================

/**
 * 信号统计信息
 */
export interface SignalStats {
  total: number;
  byCategory: Map<string, number>;
  errorCount: number;
  performanceCount: number;
  userRequestCount: number;
}

/**
 * 分析信号统计
 */
export function analyzeSignals(signals: Signal[]): SignalStats {
  const byCategory = new Map<string, number>();
  let errorCount = 0;
  let performanceCount = 0;
  let userRequestCount = 0;
  
  signals.forEach(signal => {
    let category = 'other';
    
    if (signal.startsWith('error') || signal === 'log_error' || signal === 'system_error') {
      category = 'error';
      errorCount++;
    } else if (signal.startsWith('perf_')) {
      category = 'performance';
      performanceCount++;
    } else if (signal.startsWith('user_')) {
      category = 'user_request';
      userRequestCount++;
    } else if (signal.startsWith('system_')) {
      category = 'system';
    } else if (signal.startsWith('recurring') || signal.startsWith('frequent')) {
      category = 'pattern';
    }
    
    byCategory.set(category, (byCategory.get(category) || 0) + 1);
  });
  
  return {
    total: signals.length,
    byCategory,
    errorCount,
    performanceCount,
    userRequestCount
  };
}
