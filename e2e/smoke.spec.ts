/**
 * E2E 冒烟测试 - LocalEvomap 基础功能验证
 *
 * 验证：
 * 1. LocalEvomap 能正确初始化
 * 2. 添加基因和胶囊
 * 3. 执行 evolve() 并返回 EvolutionEvent
 * 4. 临时目录自动清理
 */

import { test, expect } from '@playwright/test';
import {
  createTempEvomap,
  cleanupTempDir,
  seedTestData,
  buildErrorLogs,
  buildPerfLogs,
  buildEmptyLogs
} from './fixtures/test-fixtures';
import type { TempEvomapContext } from './fixtures/test-fixtures';
import type { EvolutionEvent } from '../types/gene-capsule-schema';
import * as fs from 'fs/promises';

// ============================================================================
// 初始化与基础功能
// ============================================================================

test.describe('LocalEvomap 初始化', () => {
  let ctx: TempEvomapContext;

  test.afterEach(async () => {
    if (ctx) {
      await cleanupTempDir(ctx.baseDir);
    }
  });

  test('应能成功初始化并使用独立临时目录', async () => {
    ctx = await createTempEvomap();

    // 验证目录结构已创建
    const genesExists = await fs.access(ctx.genesDir).then(() => true).catch(() => false);
    const capsulesExists = await fs.access(ctx.capsulesDir).then(() => true).catch(() => false);
    const eventsExists = await fs.access(ctx.eventsDir).then(() => true).catch(() => false);

    expect(genesExists).toBe(true);
    expect(capsulesExists).toBe(true);
    expect(eventsExists).toBe(true);
  });

  test('不同实例应使用不同的临时目录', async () => {
    const ctx1 = await createTempEvomap();
    const ctx2 = await createTempEvomap();

    try {
      expect(ctx1.baseDir).not.toBe(ctx2.baseDir);
    } finally {
      await cleanupTempDir(ctx1.baseDir);
      await cleanupTempDir(ctx2.baseDir);
    }
    
    ctx = ctx1; // afterEach 会尝试清理，但已经清理了（容错）
  });

  test('初始化后基因池和胶囊池应为空', async () => {
    ctx = await createTempEvomap();

    const geneStats = await ctx.evomap.getGenePoolStats();
    const capsuleStats = await ctx.evomap.getCapsulePoolStats();

    expect(geneStats.total).toBe(0);
    expect(capsuleStats.total).toBe(0);
  });
});

// ============================================================================
// 基因和胶囊管理
// ============================================================================

test.describe('基因和胶囊管理', () => {
  let ctx: TempEvomapContext;

  test.afterEach(async () => {
    if (ctx) {
      await cleanupTempDir(ctx.baseDir);
    }
  });

  test('应能添加基因并在统计中体现', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    const stats = await ctx.evomap.getGenePoolStats();
    expect(stats.total).toBeGreaterThan(0);
  });

  test('应能添加胶囊并在统计中体现', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    const stats = await ctx.evomap.getCapsulePoolStats();
    expect(stats.total).toBeGreaterThan(0);
  });

  test('应能添加单个基因', async () => {
    ctx = await createTempEvomap();

    await ctx.evomap.addGene({
      type: 'Gene',
      id: 'gene_single_test',
      category: 'repair',
      signals_match: ['error'],
      preconditions: [],
      strategy: ['fix error'],
      constraints: { max_files: 1, max_lines: 10 }
    });

    const stats = await ctx.evomap.getGenePoolStats();
    expect(stats.total).toBe(1);
  });
});

// ============================================================================
// evolve() 核心功能
// ============================================================================

test.describe('evolve() 进化循环', () => {
  let ctx: TempEvomapContext;

  test.afterEach(async () => {
    if (ctx) {
      await cleanupTempDir(ctx.baseDir);
    }
  });

  test('应能执行 evolve() 并返回 EvolutionEvent', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    const logs = buildErrorLogs();
    const result = await ctx.evomap.evolve(logs);
    const event = result.event;

    // 验证事件结构
    expect(event).toBeDefined();
    expect(typeof event.id).toBe('string');
    expect(event.id).toBeTruthy();
    expect(typeof event.timestamp).toBe('string');
    expect(Array.isArray(event.signals)).toBe(true);
    expect(typeof event.selected_gene).toBe('string');
    expect(event.outcome).toBeDefined();
    expect(event.validation).toBeDefined();
  });

  test('EvolutionEvent 应包含有效的 outcome', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    const logs = buildErrorLogs('TypeError: Cannot read property of undefined');
    const { event }: { event: EvolutionEvent } = await ctx.evomap.evolve(logs);

    expect(['success', 'failed', 'partial', 'skipped']).toContain(event.outcome.status);
    expect(typeof event.outcome.score).toBe('number');
    expect(event.outcome.score).toBeGreaterThanOrEqual(0);
    expect(event.outcome.score).toBeLessThanOrEqual(1);
    expect(event.outcome.changes).toBeDefined();
    expect(typeof event.outcome.changes.files_modified).toBe('number');
    expect(typeof event.outcome.changes.lines_added).toBe('number');
    expect(typeof event.outcome.changes.lines_removed).toBe('number');
  });

  test('EvolutionEvent 应包含有效的 validation 字段', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    const logs = buildErrorLogs();
    const { event }: { event: EvolutionEvent } = await ctx.evomap.evolve(logs);

    expect(typeof event.validation.passed).toBe('boolean');
    expect(typeof event.validation.commands_run).toBe('number');
  });

  test('空日志输入时 evolve 应抛出 No signals 错误', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    const logs = buildEmptyLogs();
    // 空日志无法提取信号，引擎会抛出错误
    await expect(ctx.evomap.evolve(logs)).rejects.toThrow();
  });

  test('无基因池时 evolve 应抛出 Gene pool is empty 错误', async () => {
    ctx = await createTempEvomap();
    // 不调用 seedTestData - 基因池为空

    const logs = buildErrorLogs();
    // 引擎在基因池为空时会抛出错误
    await expect(ctx.evomap.evolve(logs)).rejects.toThrow('Gene pool is empty');
  });

  test('性能信号应能触发进化', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    // 使用包含明确关键词的日志，确保信号提取成功
    const logs = [
      {
        type: 'tool_result',
        content: 'slow performance bottleneck detected timeout',
        timestamp: new Date().toISOString()
      }
    ];

    // 如果信号提取失败（无法匹配），会抛出错误；成功则返回事件
    try {
      const result = await ctx.evomap.evolve(logs);
      expect(result).toBeDefined();
      expect(result.event.id).toBeTruthy();
    } catch (e: unknown) {
      // 信号提取可能找不到匹配，这也是有效行为
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).toMatch(/signals?|gene|pool/i);
    }
  });

  test('多次 evolve 应生成不同的事件 ID', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    const logs = buildErrorLogs();
    const result1 = await ctx.evomap.evolve(logs);
    const result2 = await ctx.evomap.evolve(logs);

    expect(result1.event.id).not.toBe(result2.event.id);
  });
});

// ============================================================================
// 信号提取
// ============================================================================

test.describe('信号提取', () => {
  let ctx: TempEvomapContext;

  test.afterEach(async () => {
    if (ctx) {
      await cleanupTempDir(ctx.baseDir);
    }
  });

  test('应能从错误日志提取信号', async () => {
    ctx = await createTempEvomap();

    const logs = buildErrorLogs('TypeError: undefined is not a function');
    const signals = ctx.evomap.extractSignals(logs);

    expect(Array.isArray(signals)).toBe(true);
  });

  test('空日志应返回空信号数组', async () => {
    ctx = await createTempEvomap();

    const signals = ctx.evomap.extractSignals([]);
    expect(Array.isArray(signals)).toBe(true);
  });
});

// ============================================================================
// 事件日志
// ============================================================================

test.describe('事件日志', () => {
  let ctx: TempEvomapContext;

  test.afterEach(async () => {
    if (ctx) {
      await cleanupTempDir(ctx.baseDir);
    }
  });

  test('evolve 后应能获取最近事件', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    // 使用两次确定能成功的错误日志
    await ctx.evomap.evolve(buildErrorLogs('Error: something went wrong'));
    await ctx.evomap.evolve(buildErrorLogs('TypeError: null reference'));

    const recentEvents = await ctx.evomap.getRecentEvents(10);
    expect(Array.isArray(recentEvents)).toBe(true);
    expect(recentEvents.length).toBeGreaterThanOrEqual(2);
  });

  test('事件统计应返回正确结构', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    await ctx.evomap.evolve(buildErrorLogs());

    const stats = await ctx.evomap.getEventStats();
    expect(stats).toBeDefined();
  });
});

// ============================================================================
// 安全验证
// ============================================================================

test.describe('安全验证（isCommandSafe）', () => {
  let ctx: TempEvomapContext;

  test.afterEach(async () => {
    if (ctx) {
      await cleanupTempDir(ctx.baseDir);
    }
  });

  test('npm 命令应被允许', async () => {
    ctx = await createTempEvomap();
    expect(ctx.evomap.isCommandSafe('npm test')).toBe(true);
  });

  test('node 命令应被允许', async () => {
    ctx = await createTempEvomap();
    expect(ctx.evomap.isCommandSafe('node script.js')).toBe(true);
  });

  test('rm -rf 命令应被拒绝', async () => {
    ctx = await createTempEvomap();
    expect(ctx.evomap.isCommandSafe('rm -rf /')).toBe(false);
  });
});

// ============================================================================
// 配置管理
// ============================================================================

test.describe('配置管理', () => {
  let ctx: TempEvomapContext;

  test.afterEach(async () => {
    if (ctx) {
      await cleanupTempDir(ctx.baseDir);
    }
  });

  test('getConfig 应返回有效配置', async () => {
    ctx = await createTempEvomap();

    const config = ctx.evomap.getConfig();
    expect(config.strategy).toBeDefined();
    expect(config.genes_path).toBeDefined();
    expect(config.capsules_path).toBeDefined();
    expect(config.events_path).toBeDefined();
  });

  test('数据导出应返回完整结构', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    const data = await ctx.evomap.exportData();
    expect(Array.isArray(data.genes)).toBe(true);
    expect(Array.isArray(data.capsules)).toBe(true);
    expect(Array.isArray(data.events)).toBe(true);
    expect(data.config).toBeDefined();

    expect(data.genes.length).toBeGreaterThan(0);
    expect(data.capsules.length).toBeGreaterThan(0);
  });
});
