/**
 * Signal Extractor Unit Tests
 * 
 * Tests for core/signal-extractor.ts
 * Covers: extractSignals, prioritizeSignals, analyzeSignals
 */

import {
  extractSignals,
  prioritizeSignals,
  analyzeSignals,
  type LogEntry,
  type SignalContext,
  type ExtractedSignals,
  type SignalStats
} from './signal-extractor';
import type { Signal, EvolutionEvent } from '../types/gene-capsule-schema';

describe('Signal Extractor', () => {
  
  // ============================================================================
  // extractSignals - Error Signals
  // ============================================================================
  
  describe('extractSignals - Error Signals', () => {
    it('should extract log_error signal from tool_result with error', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: {
              message: 'TypeError: undefined is not a function',
              code: 'ERR_TYPE'
            },
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('log_error');
      expect(result.signals.some(s => s.startsWith('errsig:'))).toBe(true);
      expect(result.signals).toContain('error_code:ERR_TYPE');
    });

    it('should extract error signature signal (errsig:)', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: {
              message: 'Connection refused',
              code: 'ECONNREFUSED',
              stack: 'at connect (connection.js:10)'
            },
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      const errSigSignal = result.signals.find(s => s.startsWith('errsig:'));
      expect(errSigSignal).toBeDefined();
      expect(errSigSignal).toContain('ECONNREFUSED');
    });

    it('should extract error_code signal', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: {
              message: 'Permission denied',
              code: 'EACCES'
            },
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('error_code:EACCES');
    });

    it('should extract error message keywords (undefined)', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: {
              message: 'Cannot read property of undefined'
            },
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('error_undefined');
    });

    it('should extract error message keywords (null)', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: {
              message: 'Null pointer exception'
            },
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('error_null');
    });

    it('should extract timeout error signal', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: {
              message: 'Operation timeout after 30s'
            },
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('error_timeout');
    });

    it('should extract multiple error keyword signals', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: {
              message: 'Stack overflow: circular reference in memory'
            },
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('error_stack');
      expect(result.signals).toContain('error_circular');
      expect(result.signals).toContain('error_memory');
    });

    it('should extract system_error from error type logs', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'error',
            content: 'Runtime error occurred',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('system_error');
    });

    it('should extract error_msg signal from error logs', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'error',
            content: 'Unexpected token in JSON parsing',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      const errMsgSignal = result.signals.find(s => s.startsWith('error_msg:'));
      expect(errMsgSignal).toBeDefined();
    });
  });

  // ============================================================================
  // extractSignals - Performance Signals
  // ============================================================================
  
  describe('extractSignals - Performance Signals', () => {
    it('should extract perf_critical for latency > 10000ms', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            latency: 15000,
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('perf_critical');
    });

    it('should extract perf_bottleneck for latency 5000-10000ms', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            latency: 7000,
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('perf_bottleneck');
    });

    it('should not extract perf signals for latency < 5000ms', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            latency: 3000,
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals.filter(s => s.startsWith('perf_'))).toHaveLength(0);
    });

    it('should extract exact thresholds: perf_critical at 10001ms', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            latency: 10001,
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('perf_critical');
    });

    it('should extract exact thresholds: perf_bottleneck at 5001ms', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            latency: 5001,
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('perf_bottleneck');
    });
  });

  // ============================================================================
  // extractSignals - User Input Signals
  // ============================================================================
  
  describe('extractSignals - User Input Signals', () => {
    it('should extract user_feature_request for feature keywords', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'user_input',
            user_input: 'Please add a new feature for better performance',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('user_feature_request');
    });

    it('should extract user_bug_report for bug keywords', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'user_input',
            user_input: 'There is a bug in the login flow',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('user_bug_report');
    });

    it('should extract user_bug_report for "not working" phrase', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'user_input',
            user_input: 'The API is not working correctly',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('user_bug_report');
    });

    it('should extract performance_concern for performance keywords', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'user_input',
            user_input: 'Please optimize the slow database queries',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('performance_concern');
    });

    it('should extract security_concern for security keywords', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'user_input',
            user_input: 'We need better security for this application',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('security_concern');
    });

    it('should extract refactor_request for refactoring keywords', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'user_input',
            user_input: 'We should refactor this messy code',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('refactor_request');
    });

    it('should extract testing_concern for testing keywords', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'user_input',
            user_input: 'We need more unit tests for this module',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('testing_concern');
    });

    it('should handle multiple user input signals in one log', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'user_input',
            user_input: 'Fix the bug and optimize performance with e2e tests',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('user_bug_report');
      expect(result.signals).toContain('performance_concern');
      expect(result.signals).toContain('testing_concern');
    });
  });

  // ============================================================================
  // extractSignals - System Signals
  // ============================================================================
  
  describe('extractSignals - System Signals', () => {
    it('should extract system_timeout signal', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'system',
            content: 'Request timeout occurred',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('system_timeout');
    });

    it('should extract memory_pressure signal', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'system',
            content: 'Memory usage critical, heap allocation failed',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('memory_pressure');
    });

    it('should extract cpu_pressure signal', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'system',
            content: 'CPU overload detected',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('cpu_pressure');
    });

    it('should extract disk_pressure signal', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'system',
            content: 'Disk storage is running low',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('disk_pressure');
    });

    it('should extract network_issue signal', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'system',
            content: 'Network connection lost',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('network_issue');
    });

    it('should extract multiple system signals', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'system',
            content: 'Memory and CPU usage both critical, timeout approaching',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('memory_pressure');
      expect(result.signals).toContain('cpu_pressure');
      expect(result.signals).toContain('system_timeout');
    });
  });

  // ============================================================================
  // extractSignals - Edge Cases
  // ============================================================================
  
  describe('extractSignals - Edge Cases', () => {
    it('should reject completely empty context', () => {
      const context: SignalContext = {
        logs: []
      };

      expect(() => extractSignals(context)).toThrow('logs or history is required');
    });

    it('should handle logs with no errors or signals', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            latency: 100,
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toHaveLength(0);
    });

    it('should deduplicate signals', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: { message: 'timeout error' },
            timestamp: '2024-01-01T00:00:00Z'
          },
          {
            type: 'tool_result',
            error: { message: 'another timeout' },
            timestamp: '2024-01-01T00:00:01Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      const errorTimeoutCount = result.signals.filter(s => s === 'error_timeout').length;
      expect(errorTimeoutCount).toBe(1);
    });

    it('should handle mixed signal types in single context', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: { message: 'timeout error' },
            latency: 15000,
            timestamp: '2024-01-01T00:00:00Z'
          },
          {
            type: 'user_input',
            user_input: 'Please fix this bug',
            timestamp: '2024-01-01T00:00:01Z'
          },
          {
            type: 'system',
            content: 'Memory pressure detected',
            timestamp: '2024-01-01T00:00:02Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.signals).toContain('error_timeout');
      expect(result.signals).toContain('perf_critical');
      expect(result.signals).toContain('user_bug_report');
      expect(result.signals).toContain('memory_pressure');
    });

    it('should include prioritySignals in result', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: { message: 'Error!' },
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.prioritySignals).toBeDefined();
      expect(result.prioritySignals.length).toBeGreaterThan(0);
    });

    it('should include rawSignals in result', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: { message: 'Error!' },
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };
      
      const result = extractSignals(context);
      expect(result.rawSignals).toBeDefined();
      expect(result.rawSignals.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // extractSignals - Pattern Signals from History
  // ============================================================================
  
  describe('extractSignals - Pattern Signals', () => {
    // Helper function to create valid EvolutionEvent
    const createEvent = (id: string, status: 'failed' | 'success', gene: string = 'gene1'): EvolutionEvent => ({
      id,
      timestamp: new Date(Date.now() + parseInt(id) * 1000).toISOString(),
      signals: [] as Signal[],
      selected_gene: gene,
      outcome: {
        status,
        score: status === 'success' ? 1 : 0,
        changes: {
          files_modified: 1,
          lines_added: 10,
          lines_removed: 5
        }
      },
      validation: {
        passed: status === 'success',
        commands_run: 1
      }
    });

    it('should extract recurring_failures for > 5 failures in last 10 events', () => {
      const history: EvolutionEvent[] = [
        createEvent('1', 'failed'),
        createEvent('2', 'failed'),
        createEvent('3', 'failed'),
        createEvent('4', 'failed'),
        createEvent('5', 'failed'),
        createEvent('6', 'failed'),
        createEvent('7', 'success'),
        createEvent('8', 'success'),
        createEvent('9', 'success'),
        createEvent('10', 'success'),
      ];

      const context: SignalContext = { logs: [], history };
      const result = extractSignals(context);
      expect(result.signals).toContain('recurring_failures');
    });

    it('should extract low_success_rate for < 30% success', () => {
      const history: EvolutionEvent[] = Array.from({ length: 20 }, (_, i) => 
        createEvent(String(i), i < 15 ? 'failed' : 'success')
      );

      const context: SignalContext = { logs: [], history };
      const result = extractSignals(context);
      expect(result.signals).toContain('low_success_rate');
    });

    it('should extract high_success_rate for > 80% success', () => {
      const history: EvolutionEvent[] = Array.from({ length: 20 }, (_, i) =>
        createEvent(String(i), i < 3 ? 'failed' : 'success')
      );

      const context: SignalContext = { logs: [], history };
      const result = extractSignals(context);
      expect(result.signals).toContain('high_success_rate');
    });

    it('should extract frequent_gene signal for frequently used gene', () => {
      const history: EvolutionEvent[] = Array.from({ length: 15 }, (_, i) =>
        createEvent(String(i), 'success', i < 10 ? 'gene_common' : 'gene_rare')
      );

      const context: SignalContext = { logs: [], history };
      const result = extractSignals(context);
      expect(result.signals.some(s => s.startsWith('frequent_gene:'))).toBe(true);
      expect(result.signals).toContain('frequent_gene:gene_common');
    });

    it('should not extract pattern signals for history with < 5 events', () => {
      const history: EvolutionEvent[] = Array.from({ length: 3 }, (_, i) =>
        createEvent(String(i), 'failed')
      );

      const context: SignalContext = { logs: [], history };
      const result = extractSignals(context);
      expect(result.signals.filter(s => s.startsWith('recurring') || s.startsWith('frequent'))).toHaveLength(0);
    });
  });

  // ============================================================================
  // prioritizeSignals Tests
  // ============================================================================
  
  describe('prioritizeSignals', () => {
    it('should prioritize error signals highest', () => {
      const signals: Signal[] = [
        'user_bug_report',
        'log_error',
        'perf_critical',
        'system_timeout'
      ];

      const result = prioritizeSignals(signals);
      expect(result[0]).toBe('log_error');
    });

    it('should put system_error before performance signals', () => {
      const signals: Signal[] = [
        'perf_critical',
        'system_error',
        'perf_bottleneck'
      ];

      const result = prioritizeSignals(signals);
      expect(result.indexOf('system_error')).toBeLessThan(result.indexOf('perf_critical'));
    });

    it('should prioritize perf_critical over perf_bottleneck', () => {
      const signals: Signal[] = [
        'perf_bottleneck',
        'perf_critical'
      ];

      const result = prioritizeSignals(signals);
      expect(result[0]).toBe('perf_critical');
    });

    it('should put user signals before system signals', () => {
      const signals: Signal[] = [
        'system_timeout',
        'user_bug_report',
        'memory_pressure'
      ];

      const result = prioritizeSignals(signals);
      expect(result.indexOf('user_bug_report')).toBeLessThan(result.indexOf('system_timeout'));
    });

    it('should handle error code signals in priority order', () => {
      const signals: Signal[] = [
        'user_bug_report',
        'error_code:ECONNREFUSED',
        'errsig:{"code":"ERR_CODE"}'
      ];

      const result = prioritizeSignals(signals);
      // Signals in the priority list come first (user_bug_report is at index 2 in the priority array)
      expect(result[0]).toBe('user_bug_report');
      // errsig: has type priority 100 (highest non-list priority)
      expect(result[1]).toMatch(/^errsig:/);
      // error_code: has type priority 101
      expect(result[2]).toMatch(/^error_code:/);
    });

    it('should handle mixed known and unknown signals', () => {
      const signals: Signal[] = [
        'unknown_signal_xyz',
        'log_error',
        'another_unknown'
      ];

      const result = prioritizeSignals(signals);
      expect(result[0]).toBe('log_error');
      expect(result.length).toBe(3);
    });

    it('should preserve all signals after prioritization', () => {
      const signals: Signal[] = [
        'log_error',
        'perf_critical',
        'user_bug_report',
        'system_timeout',
        'recurring_failures'
      ];

      const result = prioritizeSignals(signals);
      expect(result).toHaveLength(signals.length);
      expect(new Set(result)).toEqual(new Set(signals));
    });

    it('should maintain stability for signals with same priority', () => {
      const signals: Signal[] = [
        'perf_bottleneck',
        'perf_critical'
      ];

      const result = prioritizeSignals(signals);
      expect(result[0]).toBe('perf_critical');
      expect(result[1]).toBe('perf_bottleneck');
    });
  });

  // ============================================================================
  // analyzeSignals Tests
  // ============================================================================
  
  describe('analyzeSignals', () => {
    it('should calculate total signal count', () => {
      const signals: Signal[] = [
        'log_error',
        'perf_critical',
        'user_bug_report'
      ];

      const stats = analyzeSignals(signals);
      expect(stats.total).toBe(3);
    });

    it('should categorize error signals', () => {
      const signals: Signal[] = [
        'log_error',
        'system_error',
        'error_timeout'
      ];

      const stats = analyzeSignals(signals);
      expect(stats.errorCount).toBe(3);
      expect(stats.byCategory.get('error')).toBe(3);
    });

    it('should categorize performance signals', () => {
      const signals: Signal[] = [
        'perf_critical',
        'perf_bottleneck'
      ];

      const stats = analyzeSignals(signals);
      expect(stats.performanceCount).toBe(2);
      expect(stats.byCategory.get('performance')).toBe(2);
    });

    it('should categorize user request signals', () => {
      const signals: Signal[] = [
        'user_bug_report',
        'user_feature_request'
      ];

      const stats = analyzeSignals(signals);
      expect(stats.userRequestCount).toBe(2);
      expect(stats.byCategory.get('user_request')).toBe(2);
    });

    it('should categorize system signals', () => {
      const signals: Signal[] = [
        'system_timeout',
        'system_error'
      ];

      const stats = analyzeSignals(signals);
      // system_error is actually categorized as 'error' not 'system'
      expect(stats.byCategory.get('system')).toBe(1);
      expect(stats.byCategory.get('error')).toBe(1);
    });

    it('should categorize pattern signals', () => {
      const signals: Signal[] = [
        'recurring_failures',
        'frequent_gene:gene1'
      ];

      const stats = analyzeSignals(signals);
      expect(stats.byCategory.get('pattern')).toBe(2);
    });

    it('should handle unknown signal categories as "other"', () => {
      const signals: Signal[] = [
        'unknown_signal'
      ];

      const stats = analyzeSignals(signals);
      expect(stats.byCategory.get('other')).toBe(1);
    });

    it('should handle mixed signal types', () => {
      const signals: Signal[] = [
        'log_error',
        'perf_critical',
        'user_bug_report',
        'system_timeout',
        'recurring_failures'
      ];

      const stats = analyzeSignals(signals);
      expect(stats.total).toBe(5);
      expect(stats.errorCount).toBe(1);
      expect(stats.performanceCount).toBe(1);
      expect(stats.userRequestCount).toBe(1);
    });

    it('should track byCategory as Map', () => {
      const signals: Signal[] = [
        'log_error',
        'perf_critical'
      ];

      const stats = analyzeSignals(signals);
      expect(stats.byCategory instanceof Map).toBe(true);
      expect(stats.byCategory.has('error')).toBe(true);
      expect(stats.byCategory.has('performance')).toBe(true);
    });
  });

  // ============================================================================
  // Multi-language and Special Cases
  // ============================================================================
  
  describe('Multi-language and Special Cases', () => {
    it('should handle error messages with special characters', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: {
              message: 'TypeError: Cannot read property \'foo\' of undefined'
            },
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };

      const result = extractSignals(context);
      expect(result.signals).toContain('error_undefined');
    });

    it('should handle case-insensitive matching for error keywords', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: {
              message: 'TIMEOUT ERROR - Operation could not complete'
            },
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };

      const result = extractSignals(context);
      expect(result.signals).toContain('error_timeout');
    });

    it('should handle case-insensitive matching for user input', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'user_input',
            user_input: 'PLEASE FIX THIS BUG IN THE APPLICATION',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };

      const result = extractSignals(context);
      expect(result.signals).toContain('user_bug_report');
    });

    it('should handle long error messages (truncation)', () => {
      const longMessage = 'x'.repeat(500);
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: {
              message: longMessage
            },
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };

      const result = extractSignals(context);
      const errSigSignal = result.signals.find(s => s.startsWith('errsig:'));
      expect(errSigSignal).toBeDefined();
      // Should be truncated to 200 chars (plus 'errsig:' prefix)
      expect(errSigSignal!.length).toBeLessThan(220);
    });

    it('should extract error_permission for permission-related errors', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: {
              message: 'Permission denied: you do not have access'
            },
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };

      const result = extractSignals(context);
      expect(result.signals).toContain('error_permission');
    });

    it('should extract error_not_found for missing resource errors', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: {
              message: 'File not found in the system'
            },
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };

      const result = extractSignals(context);
      expect(result.signals).toContain('error_not_found');
    });

    it('should extract error_connection for connection errors', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: {
              message: 'Connection refused by remote server'
            },
            timestamp: '2024-01-01T00:00:00Z'
          }
        ]
      };

      const result = extractSignals(context);
      expect(result.signals).toContain('error_connection');
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================
  
  describe('Integration Tests', () => {
    it('should extract and prioritize signals correctly in full workflow', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: {
              message: 'Timeout: Operation could not complete',
              code: 'TIMEOUT'
            },
            latency: 15000,
            timestamp: '2024-01-01T00:00:00Z'
          },
          {
            type: 'user_input',
            user_input: 'Please optimize this feature',
            timestamp: '2024-01-01T00:00:01Z'
          },
          {
            type: 'system',
            content: 'Memory pressure detected',
            timestamp: '2024-01-01T00:00:02Z'
          }
        ]
      };

      const result = extractSignals(context);
      
      // Check that signals were extracted
      expect(result.signals.length).toBeGreaterThan(0);
      
      // Check prioritization - log_error is the highest priority error signal
      expect(result.prioritySignals[0]).toBe('log_error');
      
      // Check deduplication
      const logErrors = result.signals.filter(s => s === 'log_error');
      expect(logErrors.length).toBe(1);
    });

    it('should provide accurate statistics for complex signal set', () => {
      const signals: Signal[] = [
        'log_error',
        'error_timeout',
        'perf_critical',
        'perf_bottleneck',
        'user_bug_report',
        'user_feature_request',
        'system_timeout',
        'memory_pressure',
        'recurring_failures'
      ];

      const stats = analyzeSignals(signals);
      
      expect(stats.total).toBe(9);
      expect(stats.errorCount).toBe(2);
      expect(stats.performanceCount).toBe(2);
      expect(stats.userRequestCount).toBe(2);
    });

    it('should handle real-world complex scenario', () => {
      const context: SignalContext = {
        logs: [
          {
            type: 'tool_result',
            error: {
              message: 'Stack overflow: circular reference detected',
              code: 'ERR_CIRCULAR',
              stack: 'at recursiveFunction (code.js:5)'
            },
            latency: 12000,
            timestamp: '2024-01-01T00:00:00Z'
          },
          {
            type: 'tool_result',
            error: {
              message: 'Memory allocation failed',
              code: 'ERR_MEMORY'
            },
            timestamp: '2024-01-01T00:00:01Z'
          },
          {
            type: 'user_input',
            user_input: 'We have a security vulnerability that needs fixing',
            timestamp: '2024-01-01T00:00:02Z'
          },
          {
            type: 'system',
            content: 'CPU and memory overload detected',
            timestamp: '2024-01-01T00:00:03Z'
          }
        ]
      };

      const result = extractSignals(context);
      const stats = analyzeSignals(result.signals);

      // Verify extraction
      expect(result.signals.length).toBeGreaterThan(5);
      
      // Verify categorization
      expect(stats.errorCount).toBeGreaterThanOrEqual(3);
      
      // Verify prioritization
      expect(result.prioritySignals[0]).toMatch(/^(log_error|error_)/);
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================
  
  describe('Performance', () => {
    it('should process large number of logs efficiently', () => {
      const logs: LogEntry[] = Array.from({ length: 100 }, (_, i) => ({
        type: 'tool_result' as const,
        error: i % 10 === 0 ? { message: 'Error', code: 'ERR' } : undefined,
        latency: Math.random() * 20000,
        timestamp: new Date(Date.now() + i * 1000).toISOString()
      }));

      const context: SignalContext = { logs };
      
      const startTime = Date.now();
      const result = extractSignals(context);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000);
      expect(result.signals.length).toBeGreaterThan(0);
    });

    it('should prioritize signals efficiently', () => {
      const signals: Signal[] = Array.from({ length: 100 }, (_, i) => 
        i % 5 === 0 ? 'log_error' : 
        i % 5 === 1 ? 'perf_critical' :
        i % 5 === 2 ? 'user_bug_report' :
        i % 5 === 3 ? 'system_timeout' :
        `signal_${i}`
      );

      const startTime = Date.now();
      const result = prioritizeSignals(signals);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
      expect(result.length).toBe(signals.length);
    });

    it('should analyze signals efficiently', () => {
      const signals: Signal[] = Array.from({ length: 100 }, (_, i) =>
        i % 10 === 0 ? 'log_error' :
        i % 10 === 1 ? 'perf_critical' :
        i % 10 === 2 ? 'user_bug_report' :
        `signal_${i}`
      );

      const startTime = Date.now();
      const stats = analyzeSignals(signals);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
      expect(stats.total).toBe(100);
    });
  });
});
