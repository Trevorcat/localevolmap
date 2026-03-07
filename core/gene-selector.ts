/**
 * Gene Selector - 基因选择算法
 */

import type {
  EnvFingerprint,
  Gene,
  SelectionOptions,
  SelectionResult,
  Signal,
  SignalPattern
} from '../types/gene-capsule-schema';
import { getEpigeneticBoost, pruneExpiredMarks } from './epigenetic';
import { getSignalConfidence, matchSignalPattern } from '../types/signal-registry';

export const DISTILLED_PREFIX = 'gene_distilled_';
export const DISTILLED_SCORE_FACTOR = 0.8;
export const FAILED_CAPSULE_BAN_THRESHOLD = 2;
export const FAILED_CAPSULE_OVERLAP_MIN = 0.6;

export class NoMatchingGeneError extends Error {
  constructor(signals: readonly string[]) {
    super(`No matching genes found for signals: ${signals.join(', ')}`);
    this.name = 'NoMatchingGeneError';
  }
}

export class AllGenesBannedError extends Error {
  constructor() {
    super('All genes are banned');
    this.name = 'AllGenesBannedError';
  }
}

export function computeDriftIntensity(opts: SelectionOptions): number {
  const effectivePopulationSize = opts.effectivePopulationSize || opts.genePoolSize || 1;
  if (opts.driftEnabled) {
    return effectivePopulationSize > 1
      ? Math.min(1, 1 / Math.sqrt(effectivePopulationSize) + 0.3)
      : 0.7;
  }
  return Math.min(1, 1 / Math.sqrt(effectivePopulationSize));
}

export function matchPatternToSignals(pattern: SignalPattern | string, signals: readonly string[]): boolean {
  return matchSignalPattern(pattern, signals).matched;
}

export function computeSignalOverlap(signals: readonly string[], patterns: readonly string[]): number {
  if (signals.length === 0 && patterns.length === 0) return 0;
  if (patterns.length === 0) return 0;

  const matchedPatterns = patterns.filter(pattern => matchSignalPattern(pattern, signals).matched);
  return matchedPatterns.length / patterns.length;
}

interface ScoredGene {
  gene: Gene;
  score: number;
  matchedSignals: string[];
}

function computeSpecificity(pattern: string, genes: Gene[]): number {
  const normalizedPattern = pattern.toLowerCase();
  const occurrences = genes.filter(gene =>
    gene.signals_match.some(candidate => String(candidate).toLowerCase() === normalizedPattern)
  ).length;
  return 1 / (1 + occurrences);
}

function getDeterministicRandom(opts: SelectionOptions): () => number {
  if (typeof opts.randomSeed !== 'number') {
    return Math.random;
  }

  let state = opts.randomSeed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function inferPreconditionPenalty(gene: Gene, signals: readonly string[]): number {
  if (!gene.preconditions || gene.preconditions.length === 0) {
    return 1;
  }

  const normalizedSignals = signals.map(signal => signal.toLowerCase());
  const hasError = normalizedSignals.some(signal => signal.includes('error'));
  const hasPerformance = normalizedSignals.some(signal => signal.includes('perf') || signal.includes('performance') || signal.includes('timeout'));
  const hasSecurity = normalizedSignals.some(signal => signal.includes('security') || signal.includes('auth') || signal.includes('permission'));
  const hasTesting = normalizedSignals.some(signal => signal.includes('test'));

  let penalty = 1;

  for (const precondition of gene.preconditions) {
    const normalized = precondition.toLowerCase();
    if (normalized.includes('error') && !hasError) penalty *= 0.6;
    if (normalized.includes('performance') && !hasPerformance) penalty *= 0.6;
    if (normalized.includes('security') && !hasSecurity) penalty *= 0.6;
    if (normalized.includes('test') && !hasTesting) penalty *= 0.6;
  }

  return penalty;
}

function getDistilledFactor(gene: Gene, baseFactor: number): number {
  if (!gene.id.startsWith(DISTILLED_PREFIX)) {
    return 1;
  }

  const successCount = gene.epigenetic_marks?.filter(mark => mark.outcome === 'success').length || 0;
  return Math.min(1, baseFactor + successCount * 0.04);
}

function scoreGenes(
  genes: Gene[],
  signals: readonly string[],
  envFingerprint?: EnvFingerprint,
  distilledScoreFactor: number = DISTILLED_SCORE_FACTOR
): ScoredGene[] {
  return genes.map(gene => {
    pruneExpiredMarks(gene);

    const matchedSignals = new Set<string>();
    let baseScore = 0;

    for (const pattern of gene.signals_match) {
      const match = matchSignalPattern(pattern, signals);
      if (!match.matched) {
        continue;
      }

      const specificity = computeSpecificity(String(pattern), genes);
      const matchingSignals = signals.filter(signal => matchSignalPattern(pattern, [signal]).matched);
      matchingSignals.forEach(signal => matchedSignals.add(signal));

      const averageSignalConfidence = matchingSignals.length > 0
        ? matchingSignals.reduce((sum, signal) => sum + getSignalConfidence(signal), 0) / matchingSignals.length
        : getSignalConfidence(String(pattern));

      baseScore += match.precision * (1 + specificity) * averageSignalConfidence;
    }

    const normalizedScore = gene.signals_match.length > 0
      ? baseScore / gene.signals_match.length
      : 0;

    const preconditionPenalty = inferPreconditionPenalty(gene, signals);
    const epigeneticBoost = envFingerprint ? getEpigeneticBoost(gene, envFingerprint) : 0;
    const distilledFactor = getDistilledFactor(gene, distilledScoreFactor);
    const finalScore = normalizedScore * preconditionPenalty * distilledFactor + epigeneticBoost;

    return {
      gene,
      score: finalScore,
      matchedSignals: Array.from(matchedSignals)
    };
  });
}

export function selectGene(
  genes: Gene[],
  signals: readonly string[],
  opts: SelectionOptions = {}
): SelectionResult<Gene> {
  if (genes.length === 0) {
    throw new Error('Gene pool is empty');
  }

  if (signals.length === 0) {
    throw new Error('No signals provided for gene selection');
  }

  const bannedIds = new Set(opts.bannedGeneIds || []);
  const activeGenes = bannedIds.size > 0 ? genes.filter(gene => !bannedIds.has(gene.id)) : genes;

  if (activeGenes.length === 0) {
    throw new AllGenesBannedError();
  }

  const scored = scoreGenes(activeGenes, signals, opts.envFingerprint, opts.distilledScoreFactor)
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0) {
    throw new NoMatchingGeneError(signals);
  }

  const driftIntensity = computeDriftIntensity(opts);
  const rng = getDeterministicRandom(opts);
  let selectedIndex = 0;

  if (driftIntensity > 0 && scored.length > 1 && rng() < driftIntensity) {
    const topN = Math.min(scored.length, Math.max(2, Math.ceil(scored.length * driftIntensity)));
    selectedIndex = Math.floor(rng() * topN);
  }

  if (opts.preferredGeneId) {
    const preferredIndex = scored.findIndex(item => item.gene.id === opts.preferredGeneId);
    if (preferredIndex >= 0) {
      selectedIndex = preferredIndex;
    }
  }

  const selectedEntry = scored[selectedIndex];
  const alternatives = scored
    .filter((_, index) => index !== selectedIndex)
    .slice(0, opts.alternativesCount || 5)
    .map(item => item.gene);

  const allScores = new Map<string, number>();
  scored.forEach(({ gene, score }) => allScores.set(gene.id, score));

  return {
    selected: selectedEntry.gene,
    alternatives,
    scoring: {
      selected_score: selectedEntry.score,
      all_scores: allScores
    }
  };
}

export function filterGenesByCategory(genes: Gene[], categories: string[]): Gene[] {
  return genes.filter(gene => categories.includes(gene.category));
}

export interface GenePoolStats {
  total: number;
  byCategory: Map<string, number>;
  avgSignalsPerGene: number;
  mostCommonSignals: Map<string, number>;
}

export function analyzeGenePool(genes: Gene[]): GenePoolStats {
  const byCategory = new Map<string, number>();
  const signalFrequency = new Map<string, number>();
  let totalSignals = 0;

  genes.forEach(gene => {
    byCategory.set(gene.category, (byCategory.get(gene.category) || 0) + 1);
    gene.signals_match.forEach(pattern => {
      String(pattern).split('|').forEach(branch => {
        const signal = branch.trim().toLowerCase();
        signalFrequency.set(signal, (signalFrequency.get(signal) || 0) + 1);
      });
      totalSignals++;
    });
  });

  const mostCommonSignals = new Map(
    [...signalFrequency.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
  );

  return {
    total: genes.length,
    byCategory,
    avgSignalsPerGene: genes.length > 0 ? totalSignals / genes.length : 0,
    mostCommonSignals
  };
}

export function banGenesFromFailedCapsules(
  failedCapsules: Array<{ gene: string; trigger: Signal[] }>,
  genes: Gene[]
): string[] {
  const failCountByGene = new Map<string, number>();
  const failSignalsByGene = new Map<string, Signal[]>();

  for (const capsule of failedCapsules) {
    failCountByGene.set(capsule.gene, (failCountByGene.get(capsule.gene) || 0) + 1);
    failSignalsByGene.set(capsule.gene, [...(failSignalsByGene.get(capsule.gene) || []), ...capsule.trigger]);
  }

  const bannedIds: string[] = [];

  for (const [geneId, count] of failCountByGene) {
    if (count < FAILED_CAPSULE_BAN_THRESHOLD) {
      continue;
    }

    const gene = genes.find(candidate => candidate.id === geneId);
    if (!gene) {
      bannedIds.push(geneId);
      continue;
    }

    const failSignals = failSignalsByGene.get(geneId) || [];
    const overlap = computeSignalOverlap(failSignals, gene.signals_match.map(pattern => String(pattern)));
    if (overlap >= FAILED_CAPSULE_OVERLAP_MIN) {
      bannedIds.push(geneId);
    }
  }

  return bannedIds;
}
