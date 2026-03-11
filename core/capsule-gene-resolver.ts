import { matchPatternToSignals } from './gene-selector';
import type { Capsule, Gene } from '../types/gene-capsule-schema';

function needsResolution(geneId: string | undefined): boolean {
  return !geneId || geneId.trim() === '' || geneId.trim().toLowerCase() === 'unknown';
}

function countMatches(gene: Gene, signals: readonly string[]): number {
  return gene.signals_match.filter(pattern => matchPatternToSignals(pattern, signals)).length;
}

export function inferGeneIdFromSignals(signals: readonly string[], genes: readonly Gene[]): string | undefined {
  if (signals.length === 0 || genes.length === 0) {
    return undefined;
  }

  const ranked = genes
    .map(gene => ({ gene, matchCount: countMatches(gene, signals) }))
    .filter(item => item.matchCount > 0)
    .sort((left, right) => right.matchCount - left.matchCount || left.gene.id.localeCompare(right.gene.id));

  return ranked[0]?.gene.id;
}

function inferGeneId(capsule: Capsule, genes: readonly Gene[]): string | undefined {
  return inferGeneIdFromSignals(capsule.trigger || [], genes);
}

export function resolveCapsuleGene(capsule: Capsule, genes: readonly Gene[]): Capsule {
  if (!needsResolution(capsule.gene)) {
    return capsule;
  }

  const inferredGeneId = inferGeneId(capsule, genes);
  if (!inferredGeneId) {
    return capsule;
  }

  return {
    ...capsule,
    gene: inferredGeneId
  };
}

export function resolveCapsuleGenes(capsules: readonly Capsule[], genes: readonly Gene[]): Capsule[] {
  return capsules.map(capsule => resolveCapsuleGene(capsule, genes));
}
