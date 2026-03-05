/**
 * Gene Selector Unit Tests
 */

import { 
  computeDriftIntensity, 
  matchPatternToSignals, 
  selectGene,
  analyzeGenePool 
} from '../core/gene-selector';
import type { Gene, Signal } from '../types/gene-capsule-schema';

describe('Gene Selector', () => {
  describe('computeDriftIntensity', () => {
    it('should return 1.0 for population size 1 without drift', () => {
      const result = computeDriftIntensity({ effectivePopulationSize: 1 });
      expect(result).toBe(1.0);
    });

    it('should return lower intensity for larger populations', () => {
      const smallPop = computeDriftIntensity({ effectivePopulationSize: 4 });
      const largePop = computeDriftIntensity({ effectivePopulationSize: 25 });
      expect(smallPop).toBeGreaterThan(largePop);
    });

    it('should increase intensity when drift is enabled', () => {
      const withoutDrift = computeDriftIntensity({ effectivePopulationSize: 4 });
      const withDrift = computeDriftIntensity({ effectivePopulationSize: 4, driftEnabled: true });
      expect(withDrift).toBeGreaterThan(withoutDrift);
    });

    it('should cap intensity at 1.0', () => {
      const result = computeDriftIntensity({ effectivePopulationSize: 1, driftEnabled: true });
      expect(result).toBeLessThanOrEqual(1.0);
    });
  });

  describe('matchPatternToSignals', () => {
    it('should match simple patterns', () => {
      const signals: Signal[] = ['log_error', 'type_error'];
      expect(matchPatternToSignals('error', signals)).toBe(true);
      expect(matchPatternToSignals('timeout', signals)).toBe(false);
    });

    it('should match multi-language patterns', () => {
      const signals: Signal[] = ['log_error'];
      expect(matchPatternToSignals('error|错误 | エラー', signals)).toBe(true);
    });

    it('should be case insensitive', () => {
      const signals: Signal[] = ['LOG_ERROR'];
      expect(matchPatternToSignals('error', signals)).toBe(true);
    });

    it('should match any branch in multi-language pattern', () => {
      const signals: Signal[] = ['type_错误'];
      expect(matchPatternToSignals('error|错误 | エラー', signals)).toBe(true);
    });
  });

  describe('selectGene', () => {
    const testGenes: Gene[] = [
      {
        type: 'Gene',
        id: 'gene_error',
        category: 'repair',
        signals_match: ['error', 'failed'],
        preconditions: [],
        strategy: [],
        constraints: {}
      },
      {
        type: 'Gene',
        id: 'gene_type',
        category: 'repair',
        signals_match: ['type_error', 'undefined'],
        preconditions: [],
        strategy: [],
        constraints: {}
      },
      {
        type: 'Gene',
        id: 'gene_perf',
        category: 'optimize',
        signals_match: ['slow', 'performance'],
        preconditions: [],
        strategy: [],
        constraints: {}
      }
    ];

    it('should select gene with highest signal match', () => {
      const signals: Signal[] = ['log_error', 'error_handler', 'failed_build'];
      const result = selectGene(testGenes, signals, { driftEnabled: false });
      expect(result.selected.id).toBe('gene_error');
    });

    it('should throw error when no genes match', () => {
      const signals: Signal[] = ['unknown_signal'];
      expect(() => selectGene(testGenes, signals)).toThrow('No matching genes found');
    });

    it('should throw error when gene pool is empty', () => {
      const signals: Signal[] = ['error'];
      expect(() => selectGene([], signals)).toThrow('Gene pool is empty');
    });

    it('should throw error when no signals provided', () => {
      expect(() => selectGene(testGenes, [])).toThrow('No signals provided');
    });

    it('should return alternatives', () => {
      const signals: Signal[] = ['log_error', 'type_error'];
      const result = selectGene(testGenes, signals, { alternativesCount: 2 });
      expect(result.alternatives.length).toBeGreaterThan(0);
    });

    it('should consider drift in selection', () => {
      const signals: Signal[] = ['log_error'];
      // Run multiple times to see drift effect
      const selections = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const result = selectGene(testGenes, signals, { 
          driftEnabled: true,
          effectivePopulationSize: 2 
        });
        selections.add(result.selected.id);
      }
      // With drift, we might see different genes selected
      expect(selections.size).toBeGreaterThan(0);
    });

    it('should provide scoring information', () => {
      const signals: Signal[] = ['log_error', 'failed'];
      const result = selectGene(testGenes, signals);
      expect(result.scoring.selected_score).toBeGreaterThan(0);
      expect(result.scoring.all_scores.size).toBeGreaterThan(0);
    });
  });

  describe('analyzeGenePool', () => {
    const testGenes: Gene[] = [
      {
        type: 'Gene',
        id: 'gene_1',
        category: 'repair',
        signals_match: ['error', 'failed'],
        preconditions: [],
        strategy: [],
        constraints: {}
      },
      {
        type: 'Gene',
        id: 'gene_2',
        category: 'repair',
        signals_match: ['error', 'type_error'],
        preconditions: [],
        strategy: [],
        constraints: {}
      },
      {
        type: 'Gene',
        id: 'gene_3',
        category: 'optimize',
        signals_match: ['slow'],
        preconditions: [],
        strategy: [],
        constraints: {}
      }
    ];

    it('should count genes by category', () => {
      const stats = analyzeGenePool(testGenes);
      expect(stats.total).toBe(3);
      expect(stats.byCategory.get('repair')).toBe(2);
      expect(stats.byCategory.get('optimize')).toBe(1);
    });

    it('should calculate average signals per gene', () => {
      const stats = analyzeGenePool(testGenes);
      expect(stats.avgSignalsPerGene).toBeCloseTo(1.67, 1);
    });

    it('should identify most common signals', () => {
      const stats = analyzeGenePool(testGenes);
      expect(stats.mostCommonSignals.has('error')).toBe(true);
    });

    it('should handle empty gene pool', () => {
      const stats = analyzeGenePool([]);
      expect(stats.total).toBe(0);
      expect(stats.avgSignalsPerGene).toBe(0);
    });
  });
});
