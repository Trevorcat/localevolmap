import type { Signal, SignalPattern } from './gene-capsule-schema';

export const KNOWN_SIGNALS = [
  'log_error',
  'system_error',
  'perf_critical',
  'perf_bottleneck',
  'user_feature_request',
  'user_bug_report',
  'security_concern',
  'performance_concern',
  'refactor_request',
  'testing_concern',
  'system_timeout',
  'memory_pressure',
  'cpu_pressure',
  'disk_pressure',
  'network_issue',
  'recurring_failures',
  'low_success_rate',
  'high_success_rate',
  'error_undefined',
  'error_null',
  'error_timeout',
  'error_permission',
  'error_not_found',
  'error_syntax',
  'error_type',
  'error_connection',
  'error_memory',
  'error_stack',
  'error_circular',
  'error_duplicate',
  'error_validation',
  'error_auth',
  'error_authz'
] as const satisfies readonly Signal[];

const SIGNAL_ALIAS_MAP: Record<string, Signal | null> = {
  error: 'log_error',
  exception: 'log_error',
  failed: null,
  crash: 'system_error',
  bug: 'user_bug_report',
  broken: 'user_bug_report',
  typeerror: 'error_type',
  referenceerror: 'log_error',
  syntaxerror: 'error_syntax',
  undefined: 'error_undefined',
  null: 'error_null',
  timeout: 'error_timeout',
  permission: 'error_permission',
  'not found': 'error_not_found',
  performance: 'performance_concern',
  warning: null,
  security: 'security_concern',
  refactor: 'refactor_request',
  test: 'testing_concern',
  testing: 'testing_concern',
  feature: 'user_feature_request'
};

export interface SignalMatch {
  matched: boolean;
  precision: number;
}

function normalizeFreeformSignal(signal: string): string {
  return signal.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeSignal(input: string): Signal | null {
  const trimmedInput = input.trim();
  const signal = normalizeFreeformSignal(input);
  if (!signal) return null;

  if (
    signal.startsWith('errsig:') ||
    signal.startsWith('error_code:') ||
    signal.startsWith('error_msg:') ||
    signal.startsWith('frequent_gene:')
  ) {
    const separatorIndex = trimmedInput.indexOf(':');
    const prefix = signal.slice(0, signal.indexOf(':'));
    const suffix = separatorIndex >= 0 ? trimmedInput.slice(separatorIndex + 1).trim() : '';
    return `${prefix}:${suffix}` as Signal;
  }

  if ((KNOWN_SIGNALS as readonly string[]).includes(signal)) {
    return signal as Signal;
  }

  return SIGNAL_ALIAS_MAP[signal] ?? null;
}

export function normalizeSignals(inputs: readonly string[]): Signal[] {
  const normalized: Signal[] = [];
  const seen = new Set<Signal>();

  for (const input of inputs) {
    const signal = normalizeSignal(input);
    if (signal && !seen.has(signal)) {
      seen.add(signal);
      normalized.push(signal);
    }
  }

  return normalized;
}

function splitSignalSegments(value: string): string[] {
  return normalizeFreeformSignal(value)
    .split(/[:_\s-]+/)
    .filter(Boolean);
}

function matchBranchToSignal(branch: string, signal: string): SignalMatch {
  const normalizedBranch = normalizeFreeformSignal(branch);
  const normalizedSignal = normalizeFreeformSignal(signal);

  if (!normalizedBranch || !normalizedSignal) {
    return { matched: false, precision: 0 };
  }

  if (normalizedSignal === normalizedBranch) {
    return { matched: true, precision: 1 };
  }

  const branchSegments = splitSignalSegments(normalizedBranch);
  const signalSegments = splitSignalSegments(normalizedSignal);

  if (branchSegments.length > 0) {
    const sameSegments = branchSegments.every(segment => signalSegments.includes(segment));
    if (sameSegments) {
      const precision = branchSegments.length === signalSegments.length ? 0.95 : 0.8;
      return { matched: true, precision };
    }
  }

  if (
    normalizedSignal.startsWith(`${normalizedBranch}_`) ||
    normalizedSignal.startsWith(`${normalizedBranch}:`) ||
    normalizedSignal.endsWith(`_${normalizedBranch}`) ||
    normalizedSignal.endsWith(`:${normalizedBranch}`)
  ) {
    return { matched: true, precision: 0.7 };
  }

  if (normalizedSignal.includes(normalizedBranch)) {
    return { matched: true, precision: 0.3 };
  }

  return { matched: false, precision: 0 };
}

export function matchSignalPattern(pattern: SignalPattern | string, signals: readonly string[]): SignalMatch {
  const branches = String(pattern)
    .split('|')
    .map(branch => branch.trim())
    .filter(Boolean);

  let bestPrecision = 0;

  for (const branch of branches) {
    for (const signal of signals) {
      const match = matchBranchToSignal(branch, signal);
      if (match.precision > bestPrecision) {
        bestPrecision = match.precision;
      }
    }
  }

  return {
    matched: bestPrecision > 0,
    precision: bestPrecision
  };
}

export function deduplicateDynamicSignals(signals: readonly Signal[], maxPerPrefix: number = 3): Signal[] {
  const counts = new Map<string, number>();
  const deduped: Signal[] = [];

  for (const signal of signals) {
    const separatorIndex = signal.indexOf(':');
    const prefix = separatorIndex > 0 ? signal.slice(0, separatorIndex) : signal;
    const count = counts.get(prefix) || 0;

    if (count >= maxPerPrefix) {
      continue;
    }

    counts.set(prefix, count + 1);
    deduped.push(signal);
  }

  return deduped;
}

export function getSignalConfidence(signal: string): number {
  const normalized = normalizeFreeformSignal(signal);

  if (normalized.startsWith('error_code:')) return 0.98;
  if (normalized.startsWith('errsig:')) return 0.95;
  if (normalized.startsWith('error_msg:')) return 0.8;
  if (normalized === 'log_error' || normalized === 'system_error') return 0.95;
  if (normalized.startsWith('error_')) return 0.9;
  if (normalized.startsWith('perf_')) return 0.8;
  if (normalized.startsWith('system_') || normalized.endsWith('_pressure') || normalized === 'network_issue') return 0.75;
  if (normalized.startsWith('user_') || normalized.endsWith('_concern') || normalized.endsWith('_request')) return 0.65;
  if (normalized.startsWith('frequent_') || normalized.includes('success_rate') || normalized.includes('recurring')) return 0.7;
  return 0.6;
}

export function getSignalSource(signal: string): 'error' | 'latency' | 'user_input' | 'system' | 'pattern' {
  const normalized = normalizeFreeformSignal(signal);

  if (normalized.startsWith('perf_')) return 'latency';
  if (normalized.startsWith('user_') || normalized.endsWith('_concern') || normalized.endsWith('_request')) return 'user_input';
  if (normalized.startsWith('system_') || normalized.endsWith('_pressure') || normalized === 'network_issue') return 'system';
  if (normalized.startsWith('frequent_') || normalized.includes('success_rate') || normalized.includes('recurring')) return 'pattern';
  return 'error';
}
