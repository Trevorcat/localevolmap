/**
 * E2E 测试 Fixtures
 *
 * 提供创建独立 LocalEvomap 实例、装载测试数据和清理临时目录的工具函数
 */

import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { LocalEvomap } from '../../index';
import type { EvolutionConfig } from '../../types/gene-capsule-schema';
import { SEED_GENES } from '../data/seed-genes';
import { SEED_CAPSULES } from '../data/seed-capsules';

// ============================================================================
// 临时目录管理
// ============================================================================

/**
 * 创建唯一临时目录路径（不自动创建）
 */
export function makeTempDir(): string {
  const uid = crypto.randomUUID();
  return path.join(os.tmpdir(), 'evomap-e2e', uid);
}

/**
 * 创建并初始化临时目录
 */
export async function createTempDir(): Promise<string> {
  const dir = makeTempDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * 清理临时目录（容错版本）
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // 忽略清理失败（如目录不存在）
  }
}

// ============================================================================
// LocalEvomap 实例工厂
// ============================================================================

export interface TempEvomapContext {
  evomap: LocalEvomap;
  baseDir: string;
  genesDir: string;
  capsulesDir: string;
  eventsDir: string;
}

/**
 * 创建带独立 tmp 目录的 LocalEvomap 实例
 *
 * 每个实例拥有独立的临时目录，避免测试间数据污染
 */
export async function createTempEvomap(
  overrides: Partial<EvolutionConfig> = {}
): Promise<TempEvomapContext> {
  const baseDir = await createTempDir();
  const genesDir = path.join(baseDir, 'genes');
  const capsulesDir = path.join(baseDir, 'capsules');
  const eventsDir = path.join(baseDir, 'events');

  // 预创建子目录
  await fs.mkdir(genesDir, { recursive: true });
  await fs.mkdir(capsulesDir, { recursive: true });
  await fs.mkdir(eventsDir, { recursive: true });

  const config: EvolutionConfig & { externalSources?: [] } = {
    strategy: 'balanced',
    genes_path: genesDir,
    capsules_path: capsulesDir,
    events_path: eventsDir,
    session_scope: `e2e-test-${crypto.randomUUID().slice(0, 8)}`,
    review_mode: false,
    max_blast_radius: { files: 50, lines: 500 },
    forbidden_paths: ['.git', 'node_modules'],
    selection: {
      driftEnabled: false,   // 关闭漂移保证测试确定性
      effectivePopulationSize: 3,
      minConfidence: 0.1,    // 低阈值方便测试
      alternativesCount: 3
    },
    externalSources: [],
    rollbackEnabled: false,
    rollbackStrategy: 'none',
    cacheEnabled: false,
    cacheTtlMs: 3600000,
    ...overrides
  };

  const evomap = new LocalEvomap(config);
  await evomap.init();

  return { evomap, baseDir, genesDir, capsulesDir, eventsDir };
}

// ============================================================================
// 测试数据装载
// ============================================================================

/**
 * 向 LocalEvomap 实例装载标准种子数据
 */
export async function seedTestData(evomap: LocalEvomap): Promise<void> {
  for (const gene of SEED_GENES) {
    await evomap.addGene(gene);
  }
  for (const capsule of SEED_CAPSULES) {
    await evomap.addCapsule(capsule);
  }
}

// ============================================================================
// 测试日志工厂
// ============================================================================

/** 构建包含错误信号的日志数组 */
export function buildErrorLogs(message = 'TypeError: undefined is not a function'): object[] {
  return [
    {
      type: 'tool_result',
      error: { message },
      timestamp: new Date().toISOString()
    }
  ];
}

/** 构建包含性能信号的日志数组 */
export function buildPerfLogs(): object[] {
  return [
    {
      type: 'tool_result',
      content: 'Operation is too slow, perf_bottleneck detected',
      timestamp: new Date().toISOString()
    }
  ];
}

/** 构建空日志数组 */
export function buildEmptyLogs(): object[] {
  return [];
}
