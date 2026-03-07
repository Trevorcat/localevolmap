/**
 * Signal Extractor - 信号提取引擎
 *
 * 从运行时日志和历史中提取结构化信号
 */

import { z } from 'zod';
import type { EvolutionEvent, Signal } from '../types/gene-capsule-schema';
import {
  deduplicateDynamicSignals,
  getSignalConfidence,
  getSignalSource,
  normalizeSignal
} from '../types/signal-registry';

export const PERF_BOTTLENECK_LATENCY_MS = 5000;
export const PERF_CRITICAL_LATENCY_MS = 10000;

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

export interface WeightedSignal {
  signal: Signal;
  confidence: number;
  source: 'error' | 'latency' | 'user_input' | 'system' | 'pattern';
}

export interface ExtractedSignals {
  signals: Signal[];
  prioritySignals: Signal[];
  rawSignals: Signal[];
  weightedSignals: WeightedSignal[];
}

const LogEntrySchema = z.object({
  type: z.enum(['tool_result', 'user_input', 'agent_output', 'system', 'error']),
  error: z.object({
    code: z.string().optional(),
    message: z.string(),
    stack: z.string().optional()
  }).optional(),
  latency: z.number().finite().nonnegative().optional(),
  user_input: z.string().optional(),
  content: z.string().optional(),
  timestamp: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const SignalContextSchema = z.object({
  logs: z.array(LogEntrySchema),
  history: z.array(z.any()).optional()
}).refine(context => context.logs.length > 0 || (context.history?.length || 0) > 0, {
  message: 'logs or history is required'
});

export class InvalidSignalContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSignalContextError';
  }
}

export function validateSignalContext(context: SignalContext): SignalContext {
  const parsed = SignalContextSchema.safeParse(context);
  if (!parsed.success) {
    throw new InvalidSignalContextError(parsed.error.issues.map(issue => issue.message).join('; '));
  }
  return parsed.data as SignalContext;
}

export function extractSignals(context: SignalContext): ExtractedSignals {
  const validatedContext = validateSignalContext(context);
  const rawSignals: Signal[] = [];
  const weightedSignals: WeightedSignal[] = [];

  validatedContext.logs.forEach(entry => {
    extractFromLogEntry(entry, rawSignals, weightedSignals);
  });

  if (validatedContext.history) {
    extractPatternSignals(validatedContext.history, rawSignals, weightedSignals);
  }

  const dedupedRawSignals = deduplicateDynamicSignals(rawSignals);
  const signals = Array.from(new Set(dedupedRawSignals));
  const prioritySignals = prioritizeSignals([...signals]);

  return {
    signals,
    prioritySignals,
    rawSignals: dedupedRawSignals,
    weightedSignals: deduplicateWeightedSignals(weightedSignals)
  };
}

function pushSignal(signals: Signal[], weightedSignals: WeightedSignal[], rawSignal: string): void {
  const normalized = normalizeSignal(rawSignal);
  if (!normalized) {
    return;
  }

  signals.push(normalized);
  weightedSignals.push({
    signal: normalized,
    confidence: getSignalConfidence(normalized),
    source: getSignalSource(normalized)
  });
}

function extractFromLogEntry(entry: LogEntry, signals: Signal[], weightedSignals: WeightedSignal[]): void {
  if (entry.type === 'tool_result' && entry.error) {
    pushSignal(signals, weightedSignals, 'log_error');
    pushSignal(signals, weightedSignals, `errsig:${JSON.stringify(entry.error).slice(0, 200)}`);

    if (entry.error.code) {
      pushSignal(signals, weightedSignals, `error_code:${entry.error.code}`);
    }

    extractErrorMessageSignals(entry.error.message, signals, weightedSignals);
  }

  if (typeof entry.latency === 'number' && Number.isFinite(entry.latency) && entry.latency > 0) {
    if (entry.latency > PERF_CRITICAL_LATENCY_MS) {
      pushSignal(signals, weightedSignals, 'perf_critical');
    } else if (entry.latency > PERF_BOTTLENECK_LATENCY_MS) {
      pushSignal(signals, weightedSignals, 'perf_bottleneck');
    }
  }

  if (typeof entry.user_input === 'string' && entry.user_input.trim()) {
    extractUserInputSignals(entry.user_input, signals, weightedSignals);
  }

  if (entry.type === 'system' && entry.content) {
    extractSystemSignals(entry.content, signals, weightedSignals);
  }

  if (entry.type === 'error') {
    pushSignal(signals, weightedSignals, 'system_error');
    if (entry.content) {
      pushSignal(signals, weightedSignals, `error_msg:${entry.content.slice(0, 100)}`);
    }
  }
}

function extractErrorMessageSignals(message: string, signals: Signal[], weightedSignals: WeightedSignal[]): void {
  const messageLower = message.toLowerCase();

  const errorPatterns: Array<[string, Signal]> = [
    ['undefined', 'error_undefined'],
    ['null', 'error_null'],
    ['timeout', 'error_timeout'],
    ['permission', 'error_permission'],
    ['not found', 'error_not_found'],
    ['syntax', 'error_syntax'],
    ['type error', 'error_type'],
    ['typeerror', 'error_type'],
    ['connection', 'error_connection'],
    ['memory', 'error_memory'],
    ['stack overflow', 'error_stack'],
    ['circular', 'error_circular'],
    ['duplicate', 'error_duplicate'],
    ['validation', 'error_validation'],
    ['authentication', 'error_auth'],
    ['authorization', 'error_authz']
  ];

  for (const [pattern, signal] of errorPatterns) {
    if (messageLower.includes(pattern)) {
      pushSignal(signals, weightedSignals, signal);
    }
  }
}

function extractUserInputSignals(input: string, signals: Signal[], weightedSignals: WeightedSignal[]): void {
  const inputLower = input.toLowerCase();

  const phrasePatterns: Array<{ signal: Signal; patterns: RegExp[] }> = [
    {
      signal: 'user_feature_request',
      patterns: [
        /(?:add|create|implement|build|support)\s+(?:a|an|the|new\s+)?(?:feature|endpoint|api|component|page|flow|integration|command)/i,
        /(?:need|want|would like|please)\s+(?:to\s+)?(?:add|create|implement|build|support)/i
      ]
    },
    {
      signal: 'user_bug_report',
      patterns: [
        /(?:bug|fix|broken|doesn't work|not working|problem|issue|regression)/i,
        /(?:fails?|crashes?|throws?)/i
      ]
    },
    {
      signal: 'performance_concern',
      patterns: [
        /(?:slow|performance issue|performance problem|optimi[sz]e|speed up|efficient)/i,
        /(?:latency|throughput|bottleneck)/i
      ]
    },
    {
      signal: 'security_concern',
      patterns: [
        /(?:security|vulnerabilit|secure|hack|exploit|permission issue)/i
      ]
    },
    {
      signal: 'refactor_request',
      patterns: [
        /(?:refactor|clean up|restructure|rewrite|cleanup)/i
      ]
    },
    {
      signal: 'testing_concern',
      patterns: [
        /(?:unit test|integration test|e2e|test coverage|test case|testing)/i,
        /(?:add|write|fix|update|improve)\s+(?:the\s+)?tests?/i
      ]
    }
  ];

  for (const { signal, patterns } of phrasePatterns) {
    if (patterns.some(pattern => pattern.test(inputLower))) {
      pushSignal(signals, weightedSignals, signal);
    }
  }
}

function extractSystemSignals(content: string, signals: Signal[], weightedSignals: WeightedSignal[]): void {
  const contentLower = content.toLowerCase();
  if (contentLower.includes('timeout')) pushSignal(signals, weightedSignals, 'system_timeout');
  if (contentLower.includes('memory') || contentLower.includes('heap')) pushSignal(signals, weightedSignals, 'memory_pressure');
  if (contentLower.includes('cpu') || contentLower.includes('overload')) pushSignal(signals, weightedSignals, 'cpu_pressure');
  if (contentLower.includes('disk') || contentLower.includes('storage')) pushSignal(signals, weightedSignals, 'disk_pressure');
  if (contentLower.includes('network') || contentLower.includes('connection')) pushSignal(signals, weightedSignals, 'network_issue');
}

function extractPatternSignals(history: EvolutionEvent[], signals: Signal[], weightedSignals: WeightedSignal[]): void {
  if (history.length < 5) {
    return;
  }

  const recentFailures = history.slice(-10).filter(event => event.outcome.status === 'failed').length;
  if (recentFailures > 5) {
    pushSignal(signals, weightedSignals, 'recurring_failures');
  }

  const recentEvents = history.slice(-20);
  const successRate = recentEvents.filter(event => event.outcome.status === 'success').length / recentEvents.length;
  if (successRate < 0.3) {
    pushSignal(signals, weightedSignals, 'low_success_rate');
  } else if (successRate > 0.8) {
    pushSignal(signals, weightedSignals, 'high_success_rate');
  }

  const geneFrequency = new Map<string, number>();
  history.forEach(event => {
    geneFrequency.set(event.selected_gene, (geneFrequency.get(event.selected_gene) || 0) + 1);
  });

  const mostUsedGene = Array.from(geneFrequency.entries()).sort((left, right) => right[1] - left[1])[0];
  if (mostUsedGene && mostUsedGene[1] > 5) {
    pushSignal(signals, weightedSignals, `frequent_gene:${mostUsedGene[0]}`);
  }
}

export function prioritizeSignals(signals: Signal[]): Signal[] {
  const priorityOrder: Signal[] = [
    'log_error', 'system_error',
    'error_timeout', 'error_memory', 'error_stack',
    'perf_critical', 'perf_bottleneck',
    'user_bug_report', 'user_feature_request',
    'security_concern', 'performance_concern',
    'system_timeout', 'memory_pressure', 'cpu_pressure', 'disk_pressure',
    'recurring_failures', 'low_success_rate', 'high_success_rate'
  ];

  return signals.sort((left, right) => {
    const leftIndex = priorityOrder.indexOf(left);
    const rightIndex = priorityOrder.indexOf(right);

    if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
    if (leftIndex !== -1) return -1;
    if (rightIndex !== -1) return 1;
    return signalTypePriority(left) - signalTypePriority(right);
  });
}

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

function deduplicateWeightedSignals(weightedSignals: WeightedSignal[]): WeightedSignal[] {
  const bestBySignal = new Map<Signal, WeightedSignal>();

  for (const weightedSignal of weightedSignals) {
    const current = bestBySignal.get(weightedSignal.signal);
    if (!current || current.confidence < weightedSignal.confidence) {
      bestBySignal.set(weightedSignal.signal, weightedSignal);
    }
  }

  return Array.from(bestBySignal.values());
}

export interface SignalStats {
  total: number;
  byCategory: Map<string, number>;
  errorCount: number;
  performanceCount: number;
  userRequestCount: number;
}

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
