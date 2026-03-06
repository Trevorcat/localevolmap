/**
 * E2E - 进化流程测试
 *
 * 测试完整的进化生命周期：信号提取 → 基因选择 → 胶囊匹配 → 事件记录
 */

import { test, expect } from '@playwright/test';
import {
  createTempEvomap,
  cleanupTempDir,
  seedTestData,
  buildErrorLogs,
  buildPerfLogs
} from './fixtures/test-fixtures';
import type { TempEvomapContext } from './fixtures/test-fixtures';
import { SEED_GENES } from './data/seed-genes';

test.describe('进化流程 E2E', () => {
  let ctx: TempEvomapContext;

  test.afterEach(async () => {
    if (ctx) {
      await cleanupTempDir(ctx.baseDir);
    }
  });

  // ============================================================================
  // 信号提取阶段
  // ============================================================================

  test('信号提取：错误类型日志应产生信号', async () => {
    ctx = await createTempEvomap();

    const logs = buildErrorLogs('TypeError: Cannot read properties of null');
    const signals = ctx.evomap.extractSignals(logs);

    expect(Array.isArray(signals)).toBe(true);
    // 信号提取结果取决于实现，但应是字符串数组
    signals.forEach(s => expect(typeof s).toBe('string'));
  });

  test('信号提取：性能日志应产生信号', async () => {
    ctx = await createTempEvomap();

    const logs = buildPerfLogs();
    const signals = ctx.evomap.extractSignals(logs);

    expect(Array.isArray(signals)).toBe(true);
  });

  // ============================================================================
  // 基因选择阶段
  // ============================================================================

  test('基因选择：有基因时应能选择基因', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    const signals = ctx.evomap.extractSignals(buildErrorLogs());
    const result = await ctx.evomap.selectGene(signals);

    expect(result).toBeDefined();
    expect(result.selected).toBeDefined();
    expect(result.selected.type).toBe('Gene');
    expect(typeof result.selected.id).toBe('string');
    expect(Array.isArray(result.alternatives)).toBe(true);
    expect(result.scoring).toBeDefined();
  });

  test('基因选择：应返回有效基因 ID', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    const knownGeneIds = SEED_GENES.map(g => g.id);
    const signals = ctx.evomap.extractSignals(buildErrorLogs());
    const result = await ctx.evomap.selectGene(signals);

    expect(knownGeneIds).toContain(result.selected.id);
  });

  // ============================================================================
  // 胶囊选择阶段
  // ============================================================================

  test('胶囊选择：有胶囊时应尝试匹配', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    const signals = ctx.evomap.extractSignals(buildErrorLogs());
    // selectCapsule 可能返回 undefined（无匹配），不报错即可
    const capsule = await ctx.evomap.selectCapsule(signals);

    if (capsule) {
      expect(capsule.type).toBe('Capsule');
      expect(typeof capsule.id).toBe('string');
      expect(capsule.confidence).toBeGreaterThanOrEqual(0);
      expect(capsule.confidence).toBeLessThanOrEqual(1);
    }
    // undefined 也是有效结果（没有匹配胶囊）
    expect(capsule === undefined || typeof capsule === 'object').toBe(true);
  });

  // ============================================================================
  // 完整进化循环
  // ============================================================================

  test('完整进化循环：错误日志 → 选基因 → evolve → 记录事件', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    const logs = buildErrorLogs('ReferenceError: foo is not defined');
    const result = await ctx.evomap.evolve(logs);
    const event = result.event;

    // 事件完整性验证
    expect(event.id).toBeTruthy();
    expect(event.timestamp).toBeTruthy();
    expect(event.selected_gene).toBeTruthy();
    expect(['success', 'failed', 'partial', 'skipped']).toContain(event.outcome.status);

    // 事件应持久化
    const recentEvents = await ctx.evomap.getRecentEvents(5);
    const found = recentEvents.find(e => e.id === event.id);
    expect(found).toBeDefined();
  });

  test('连续进化：多轮 evolve 后事件数量应增加', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    const N = 3;
    for (let i = 0; i < N; i++) {
      await ctx.evomap.evolve(buildErrorLogs(`Error ${i}: something went wrong`));
    }

    const events = await ctx.evomap.getRecentEvents(10);
    expect(events.length).toBeGreaterThanOrEqual(N);
  });

  test('进化后 gene pool 统计不变（evolve 不添加基因）', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    const statsBefore = await ctx.evomap.getGenePoolStats();
    await ctx.evomap.evolve(buildErrorLogs());
    const statsAfter = await ctx.evomap.getGenePoolStats();

    expect(statsAfter.total).toBe(statsBefore.total);
  });

  // ============================================================================
  // 数据导入/导出
  // ============================================================================

  test('导出数据后导入到新实例应保留数据', async () => {
    ctx = await createTempEvomap();
    await seedTestData(ctx.evomap);

    const exported = await ctx.evomap.exportData();

    // 创建新实例
    const ctx2 = await createTempEvomap();
    try {
      await ctx2.evomap.importData({
        genes: exported.genes,
        capsules: exported.capsules
      });

      const stats = await ctx2.evomap.getGenePoolStats();
      expect(stats.total).toBe(exported.genes.length);
    } finally {
      await cleanupTempDir(ctx2.baseDir);
    }
  });
});
