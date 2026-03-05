/**
 * Local Evomap - 本地进化系统主入口
 * 
 * 整合所有模块，提供统一的进化系统 API
 */

import type { 
  EvolutionConfig, 
  EvolutionEvent, 
  Gene, 
  Capsule,
  Signal 
} from './types/gene-capsule-schema';
import type { CapsuleHubConfig, HubSearchOptions, HubSearchResult } from './core/capsule-hub-client';
import { CapsuleHubClient, HubRegistry, PUBLIC_HUBS } from './core/capsule-hub-client';
import { GeneStore } from './storage/gene-store';
import { CapsuleStore } from './storage/capsule-store';
import { EventLogger } from './storage/event-logger';
import { EvolutionEngine, type EventLogger as EventLoggerInterface } from './core/evolution-engine';
import { extractSignals, prioritizeSignals } from './core/signal-extractor';
import { selectGene, computeDriftIntensity, analyzeGenePool } from './core/gene-selector';
import { selectCapsule, shouldReuseCapsule, analyzeCapsules } from './core/capsule-manager';
import { isValidationCommandAllowed, estimateBlastRadius, requiresApproval } from './core/validation-gate';

// ============================================================================
// 默认配置
// ============================================================================

export const DEFAULT_CONFIG: EvolutionConfig & { externalSources?: CapsuleHubConfig[] } = {
  strategy: 'balanced',
  genes_path: './data/genes',
  capsules_path: './data/capsules',
  events_path: './data/events',
  session_scope: 'local-dev',
  review_mode: true,
  max_blast_radius: {
    files: 50,
    lines: 500
  },
  forbidden_paths: ['.git', 'node_modules', '.env', '*.key', '*.pem'],
  selection: {
    driftEnabled: true,
    effectivePopulationSize: 3,
    minConfidence: 0.5,
    alternativesCount: 5
  },
  externalSources: [], // 默认不启用外部源
  rollbackEnabled: false,
  rollbackStrategy: 'none',
  cacheEnabled: false,
  cacheTtlMs: 3600000
};

// ============================================================================
// Local Evomap 主类
// ============================================================================

export class LocalEvomap {
  private geneStore: GeneStore;
  private capsuleStore: CapsuleStore;
  private eventLogger: EventLogger;
  private engine: EvolutionEngine | null = null;
  private hubRegistry: HubRegistry | null = null;
  
  private initialized = false;
  
  constructor(private config: EvolutionConfig & { externalSources?: CapsuleHubConfig[] } = DEFAULT_CONFIG) {
    this.geneStore = new GeneStore(config.genes_path);
    this.capsuleStore = new CapsuleStore(config.capsules_path);
    this.eventLogger = new EventLogger(config.events_path);
    
    // 初始化 Hub Registry（如果配置了外部源）
    if (config.externalSources && config.externalSources.length > 0) {
      this.hubRegistry = new HubRegistry('./.evocache');
      for (const source of config.externalSources) {
        this.hubRegistry.register(source);
      }
    }
  }
  
  /**
   * 初始化系统
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    await this.geneStore.init();
    await this.capsuleStore.init();
    await this.eventLogger.init();
    
    // 初始化 Hub Registry
    if (this.hubRegistry) {
      await this.hubRegistry.initAll();
    }
    
    // 创建进化引擎
    this.engine = new EvolutionEngine(this.config, this.eventLogger);
    
    // 加载基因和胶囊
    const genes = await this.geneStore.getAll();
    const capsules = await this.capsuleStore.getAll();
    
    if (this.engine) {
      this.engine.setGenePool(genes);
      this.engine.setCapsulePool(capsules);
    }
    
    this.initialized = true;
    
    console.log(`Local Evomap initialized`);
    console.log(`  Genes: ${genes.length}`);
    console.log(`  Capsules: ${capsules.length}`);
    console.log(`  Strategy: ${this.config.strategy}`);
    if (this.hubRegistry) {
      const hubCount = this.hubRegistry.getAll().filter(h => h.hubConfig.enabled).length;
      console.log(`  External Hubs: ${hubCount}`);
    }
  }
  
  /**
   * 执行进化
   */
  async evolve(logs: any[]): Promise<EvolutionEvent> {
    if (!this.initialized) {
      await this.init();
    }
    
    if (!this.engine) {
      throw new Error('Evolution engine not initialized');
    }
    
    return this.engine.evolve(logs);
  }
  
  /**
   * 添加基因
   */
  async addGene(gene: Gene): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
    
    await this.geneStore.add(gene);
    
    // 更新引擎基因池
    if (this.engine) {
      const genes = await this.geneStore.getAll();
      this.engine.setGenePool(genes);
    }
    
    console.log(`Gene added: ${gene.id}`);
  }
  
  /**
   * 添加胶囊
   */
  async addCapsule(capsule: Capsule): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
    
    await this.capsuleStore.add(capsule);
    
    // 更新引擎胶囊池
    if (this.engine) {
      const capsules = await this.capsuleStore.getAll();
      this.engine.setCapsulePool(capsules);
    }
    
    console.log(`Capsule added: ${capsule.id}`);
  }
  
  /**
   * 提取信号
   */
  extractSignals(logs: any[]): Signal[] {
    const { prioritySignals } = extractSignals({ logs });
    return prioritySignals;
  }
  
  /**
   * 选择基因
   */
  async selectGene(signals: Signal[]): Promise<{
    selected: Gene;
    alternatives: Gene[];
    scoring: any;
  }> {
    if (!this.initialized) {
      await this.init();
    }
    
    const genes = await this.geneStore.getAll();
    return selectGene(genes, signals, this.config.selection);
  }
  
  /**
   * 选择胶囊
   */
  async selectCapsule(signals: Signal[]): Promise<Capsule | undefined> {
    if (!this.initialized) {
      await this.init();
    }
    
    const capsules = await this.capsuleStore.getAll();
    const env = {
      node_version: process.version,
      platform: process.platform as 'linux' | 'darwin' | 'win32',
      arch: process.arch as 'x64' | 'arm64' | 'ia32',
      working_dir: process.cwd()
    };
    
    return selectCapsule(capsules, signals, env);
  }
  
  /**
   * 从外部 Hub 搜索胶囊
   */
  async searchExternalCapsules(
    opts: HubSearchOptions = {}
  ): Promise<Map<string, HubSearchResult>> {
    if (!this.initialized) {
      await this.init();
    }
    
    if (!this.hubRegistry) {
      console.warn('No external hubs configured');
      return new Map();
    }
    
    return this.hubRegistry.searchAcrossAll(opts);
  }
  
  /**
   * 从外部 Hub 下载胶囊
   */
  async downloadExternalCapsule(capsuleId: string): Promise<{
    capsule: Capsule | null;
    source: string | null;
  }> {
    if (!this.initialized) {
      await this.init();
    }
    
    if (!this.hubRegistry) {
      console.warn('No external hubs configured');
      return { capsule: null, source: null };
    }
    
    const result = await this.hubRegistry.downloadFromAny(capsuleId);
    
    // 如果下载成功，自动添加到本地存储
    if (result.capsule) {
      await this.capsuleStore.add(result.capsule);
      
      // 更新引擎胶囊池
      if (this.engine) {
        const capsules = await this.capsuleStore.getAll();
        this.engine.setCapsulePool(capsules);
      }
      
      console.log(`Downloaded and added capsule: ${capsuleId} from ${result.source}`);
    }
    
    return result;
  }
  
  /**
   * 同步外部 Hub 的胶囊
   */
  async syncExternalCapsules(signals?: Signal[]): Promise<number> {
    if (!this.initialized) {
      await this.init();
    }
    
    if (!this.hubRegistry) {
      console.warn('No external hubs configured');
      return 0;
    }
    
    let totalDownloaded = 0;
    
    // 搜索匹配的胶囊
    const searchResults = await this.hubRegistry.searchAcrossAll({
      signals,
      validatedOnly: true,
      limit: 50
    });
    
    // 收集所有胶囊 ID
    const capsuleIds = new Set<string>();
    for (const [hubName, result] of searchResults) {
      console.log(`Hub ${hubName}: ${result.capsules.length} capsules`);
      for (const capsule of result.capsules) {
        capsuleIds.add(capsule.id);
      }
    }
    
    // 下载新胶囊
    for (const id of capsuleIds) {
      const result = await this.hubRegistry.downloadFromAny(id);
      if (result.capsule) {
        totalDownloaded++;
      }
    }
    
    console.log(`Synced ${totalDownloaded} capsules from external hubs`);
    return totalDownloaded;
  }
  
  /**
   * 刷新 Hub 缓存
   */
  async refreshHubCache(hubName?: string): Promise<number> {
    if (!this.initialized) {
      await this.init();
    }
    
    if (!this.hubRegistry) {
      console.warn('No external hubs configured');
      return 0;
    }
    
    let totalCached = 0;
    
    if (hubName) {
      // 刷新指定 Hub
      const client = this.hubRegistry.get(hubName);
      if (client) {
        totalCached = await client.refreshCache();
      }
    } else {
      // 刷新所有 Hub
      for (const client of this.hubRegistry.getAll()) {
        if (client.hubConfig.enabled) {
          totalCached += await client.refreshCache();
        }
      }
    }
    
    return totalCached;
  }
  
  /**
   * 获取基因池统计
   */
  async getGenePoolStats(): Promise<any> {
    if (!this.initialized) {
      await this.init();
    }
    
    const genes = await this.geneStore.getAll();
    return analyzeGenePool(genes);
  }
  
  /**
   * 获取胶囊池统计
   */
  async getCapsulePoolStats(): Promise<any> {
    if (!this.initialized) {
      await this.init();
    }
    
    const capsules = await this.capsuleStore.getAll();
    return analyzeCapsules(capsules);
  }
  
  /**
   * 获取事件统计
   */
  async getEventStats(): Promise<any> {
    if (!this.initialized) {
      await this.init();
    }
    
    return this.eventLogger.getStats();
  }
  
  /**
   * 获取最近事件
   */
  async getRecentEvents(count: number = 10): Promise<EvolutionEvent[]> {
    if (!this.initialized) {
      await this.init();
    }
    
    return this.eventLogger.getRecent(count);
  }
  
  /**
   * 验证命令安全性
   */
  isCommandSafe(command: string): boolean {
    return isValidationCommandAllowed(command);
  }
  
  /**
   * 估算影响范围
   */
  estimateBlastRadius(files: string[], linesPerFile: Map<string, number>): any {
    return estimateBlastRadius(files, linesPerFile, this.config.forbidden_paths);
  }
  
  /**
   * 检查是否需要审批
   */
  requiresApproval(blastRadius: any): boolean {
    return requiresApproval(blastRadius, {
      reviewMode: this.config.review_mode,
      maxBlastRadius: this.config.max_blast_radius,
      autoApproveLowRisk: false
    });
  }
  
  /**
   * 获取配置
   */
  getConfig(): EvolutionConfig {
    return { ...this.config };
  }
  
  /**
   * 更新配置
   */
  updateConfig(partial: Partial<EvolutionConfig>): void {
    Object.assign(this.config, partial);
    console.log('Configuration updated');
  }
  
  /**
   * 导出所有数据
   */
  async exportData(): Promise<{
    genes: Gene[];
    capsules: Capsule[];
    events: EvolutionEvent[];
    config: EvolutionConfig;
  }> {
    if (!this.initialized) {
      await this.init();
    }
    
    return {
      genes: await this.geneStore.getAll(),
      capsules: await this.capsuleStore.getAll(),
      events: await this.eventLogger.getAll(),
      config: this.getConfig()
    };
  }
  
  /**
   * 导入数据
   */
  async importData(data: {
    genes?: Gene[];
    capsules?: Capsule[];
  }): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
    
    if (data.genes) {
      for (const gene of data.genes) {
        await this.geneStore.add(gene);
      }
    }
    
    if (data.capsules) {
      for (const capsule of data.capsules) {
        await this.capsuleStore.add(capsule);
      }
    }
    
    // 重新加载
    const genes = await this.geneStore.getAll();
    const capsules = await this.capsuleStore.getAll();
    
    if (this.engine) {
      this.engine.setGenePool(genes);
      this.engine.setCapsulePool(capsules);
    }
    
    console.log(`Imported ${data.genes?.length || 0} genes, ${data.capsules?.length || 0} capsules`);
  }
}

// ============================================================================
// 工具函数导出
// ============================================================================

export {
  // 信号
  extractSignals,
  prioritizeSignals,
  
  // 基因选择
  selectGene,
  computeDriftIntensity,
  analyzeGenePool,
  
  // 胶囊管理
  selectCapsule,
  shouldReuseCapsule,
  analyzeCapsules,
  
  // 验证
  isValidationCommandAllowed,
  estimateBlastRadius,
  requiresApproval
};

// ============================================================================
// 类型导出
// ============================================================================

export type {
  EvolutionConfig,
  EvolutionEvent,
  Gene,
  Capsule,
  Signal
} from './types/gene-capsule-schema';

export type {
  CapsuleHubConfig,
  CapsuleManifest,
  HubSearchResult,
  HubSearchOptions
} from './core/capsule-hub-client';

export {
  CapsuleHubClient,
  HubRegistry,
  PUBLIC_HUBS
} from './core/capsule-hub-client';
