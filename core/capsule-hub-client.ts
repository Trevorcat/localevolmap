/**
 * Capsule Hub Client - 外部胶囊源客户端
 * 
 * 支持从远程 Hub 发现和下载胶囊
 * 实现胶囊的验证、缓存和版本管理
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Capsule, Signal } from '../types/gene-capsule-schema';

// ============================================================================
// 类型定义
// ============================================================================

export interface CapsuleHubConfig {
  /** Hub 名称 */
  name: string;
  
  /** Hub API 端点 */
  url: string;
  
  /** 是否只使用已验证的胶囊 */
  validatedOnly: boolean;
  
  /** API 密钥（可选） */
  apiKey?: string;
  
  /** 请求超时 (ms) */
  timeoutMs?: number;
  
  /** 是否启用 */
  enabled?: boolean;
}

export interface CapsuleManifest {
  /** 胶囊 ID */
  id: string;
  
  /** 版本 */
  version: string;
  
  /** 基因 ID */
  gene: string;
  
  /** 触发信号 */
  trigger: Signal[];
  
  /** 摘要 */
  summary: string;
  
  /** 置信度 */
  confidence: number;
  
  /** 下载 URL */
  downloadUrl: string;
  
  /** 校验和 */
  checksum: string;
  
  /** 验证状态 */
  validated: boolean;
  
  /** 下载次数 */
  downloads: number;
  
  /** 评分 */
  rating?: number;
  
  /** 环境兼容性 */
  environments: Array<{
    platform: string;
    arch: string;
    node_version?: string;
  }>;
  
  /** 创建时间 */
  createdAt: string;
  
  /** 更新时间 */
  updatedAt: string;
  
  /** 缓存时间（内部使用） */
  cachedAt?: string;
}

export interface HubSearchResult {
  total: number;
  capsules: CapsuleManifest[];
  tags: string[];
  genes: string[];
}

export interface HubSearchOptions {
  /** 信号过滤 */
  signals?: Signal[];
  
  /** 基因 ID 过滤 */
  gene?: string;
  
  /** 标签过滤 */
  tags?: string[];
  
  /** 最小置信度 */
  minConfidence?: number;
  
  /** 只返回已验证的 */
  validatedOnly?: boolean;
  
  /** 环境过滤 */
  platform?: string;
  arch?: string;
  
  /** 排序字段 */
  sortBy?: 'downloads' | 'rating' | 'createdAt' | 'confidence';
  
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
  
  /** 分页 */
  limit?: number;
  offset?: number;
}

// ============================================================================
// Capsule Hub Client
// ============================================================================

export class CapsuleHubClient {
  private config: CapsuleHubConfig;
  private cacheDir: string;
  private cacheFile: string;
  
  constructor(
    config: CapsuleHubConfig,
    private cacheBaseDir: string = './.evocache'
  ) {
    this.config = config;
    this.cacheDir = path.join(cacheBaseDir, 'hub', config.name);
    this.cacheFile = path.join(this.cacheDir, 'manifests.json');
  }
  
  /** 获取 Hub 配置 */
  get hubConfig(): CapsuleHubConfig {
    return this.config;
  }
  
  /**
   * 初始化客户端
   */
  async init(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
  }
  
  /**
   * 搜索胶囊
   */
  async search(opts: HubSearchOptions = {}): Promise<HubSearchResult> {
    if (!this.config.enabled) {
      console.warn(`Hub ${this.config.name} is disabled`);
      return { total: 0, capsules: [], tags: [], genes: [] };
    }
    
    try {
      const searchUrl = new URL('/api/v1/capsules/search', this.config.url);
      
      // 添加查询参数
      if (opts.signals?.length) {
        searchUrl.searchParams.append('signals', opts.signals.join(','));
      }
      if (opts.gene) {
        searchUrl.searchParams.append('gene', opts.gene);
      }
      if (opts.tags?.length) {
        searchUrl.searchParams.append('tags', opts.tags.join(','));
      }
      if (opts.minConfidence != null) {
        searchUrl.searchParams.append('minConfidence', opts.minConfidence.toString());
      }
      if (opts.validatedOnly) {
        searchUrl.searchParams.append('validatedOnly', 'true');
      }
      if (opts.platform) {
        searchUrl.searchParams.append('platform', opts.platform);
      }
      if (opts.arch) {
        searchUrl.searchParams.append('arch', opts.arch);
      }
      if (opts.sortBy) {
        searchUrl.searchParams.append('sortBy', opts.sortBy);
        searchUrl.searchParams.append('sortOrder', opts.sortOrder || 'desc');
      }
      if (opts.limit != null) {
        searchUrl.searchParams.append('limit', opts.limit.toString());
      }
      if (opts.offset != null) {
        searchUrl.searchParams.append('offset', opts.offset.toString());
      }
      
      const response = await this.fetch(searchUrl.toString());
      const data = await response.json() as HubSearchResult;
      
      return {
        total: data.total || data.capsules.length,
        capsules: data.capsules || [],
        tags: data.tags || [],
        genes: data.genes || []
      };
      
    } catch (error) {
      console.error(`Failed to search hub ${this.config.name}:`, error);
      return { total: 0, capsules: [], tags: [], genes: [] };
    }
  }
  
  /**
   * 获取胶囊详情
   */
  async getManifest(capsuleId: string): Promise<CapsuleManifest | null> {
    try {
      const url = new URL(`/api/v1/capsules/${capsuleId}`, this.config.url);
      const response = await this.fetch(url.toString());
      
      if (response.status === 404) {
        return null;
      }
      
      return await response.json() as CapsuleManifest;
      
    } catch (error) {
      console.error(`Failed to get capsule manifest ${capsuleId}:`, error);
      return null;
    }
  }
  
  /**
   * 下载胶囊
   */
  async download(capsuleId: string): Promise<Capsule | null> {
    if (!this.config.enabled) {
      console.warn(`Hub ${this.config.name} is disabled`);
      return null;
    }
    
    try {
      // 1. 获取 manifest
      const manifest = await this.getManifest(capsuleId);
      if (!manifest) {
        console.warn(`Capsule ${capsuleId} not found`);
        return null;
      }
      
      // 2. 检查验证状态
      if (this.config.validatedOnly && !manifest.validated) {
        console.warn(`Capsule ${capsuleId} is not validated (validatedOnly=true)`);
        return null;
      }
      
      // 3. 下载胶囊数据
      const capsuleData = await this.fetch(manifest.downloadUrl);
      const capsule = await capsuleData.json() as Capsule;
      
      // 4. 验证校验和
      const content = JSON.stringify(capsule);
      const actualChecksum = crypto.createHash('sha256').update(content).digest('hex');
      
      if (actualChecksum !== manifest.checksum) {
        throw new Error(`Checksum mismatch for capsule ${capsuleId}`);
      }
      
      // 5. 保存到本地存储
      const filePath = path.join(this.cacheDir, 'capsules', `${capsuleId}.json`);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      
      // 6. 更新缓存
      await this.updateCache(manifest);
      
      console.log(`Downloaded capsule: ${capsuleId} (${manifest.version})`);
      return capsule;
      
    } catch (error) {
      console.error(`Failed to download capsule ${capsuleId}:`, error);
      return null;
    }
  }
  
  /**
   * 批量下载胶囊
   */
  async downloadMany(capsuleIds: string[]): Promise<Capsule[]> {
    const capsules: Capsule[] = [];
    
    for (const id of capsuleIds) {
      const capsule = await this.download(id);
      if (capsule) {
        capsules.push(capsule);
      }
    }
    
    return capsules;
  }
  
  /**
   * 检查更新
   */
  async checkUpdates(localCapsules: Capsule[]): Promise<CapsuleManifest[]> {
    const updates: CapsuleManifest[] = [];
    
    for (const local of localCapsules) {
      const manifest = await this.getManifest(local.id);
      if (manifest && manifest.version !== local.metadata?.created_at) {
        updates.push(manifest);
      }
    }
    
    return updates;
  }
  
  /**
   * 获取缓存的 manifests
   */
  async getCachedManifests(): Promise<CapsuleManifest[]> {
    try {
      const content = await fs.readFile(this.cacheFile, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }
  
  /**
   * 刷新缓存
   */
  async refreshCache(): Promise<number> {
    const result = await this.search({ limit: 1000 });
    
    const manifests = result.capsules.map(m => ({
      id: m.id,
      version: m.version,
      gene: m.gene,
      trigger: m.trigger,
      summary: m.summary,
      cachedAt: new Date().toISOString()
    }));
    
    await fs.writeFile(this.cacheFile, JSON.stringify(manifests, null, 2), 'utf-8');
    
    console.log(`Refreshed cache: ${manifests.length} manifests`);
    return manifests.length;
  }
  
  /**
   * 清理缓存
   */
  async clearCache(): Promise<void> {
    try {
      await fs.unlink(this.cacheFile);
    } catch {
      // 忽略不存在的错误
    }
  }
  
  /**
   * 更新缓存（添加单个 manifest）
   */
  private async updateCache(manifest: CapsuleManifest): Promise<void> {
    const cached = await this.getCachedManifests();
    
    // 检查是否已存在
    const existingIdx = cached.findIndex(m => m.id === manifest.id);
    if (existingIdx >= 0) {
      cached[existingIdx] = {
        ...manifest,
        cachedAt: new Date().toISOString()
      };
    } else {
      cached.push({
        ...manifest,
        cachedAt: new Date().toISOString()
      });
    }
    
    await fs.writeFile(this.cacheFile, JSON.stringify(cached, null, 2), 'utf-8');
  }
  
  /**
   * HTTP 请求封装
   */
  private async fetch(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs || 30000);
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Local-Evomap/1.0'
      };
      
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }
      
      const response = await fetch(url, {
        headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response;
      
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}

// ============================================================================
// Hub Registry - 管理多个 Hub
// ============================================================================

export class HubRegistry {
  private clients: Map<string, CapsuleHubClient> = new Map();
  private cacheBaseDir: string;
  
  constructor(cacheBaseDir: string = './.evocache') {
    this.cacheBaseDir = cacheBaseDir;
  }
  
  /**
   * 注册 Hub
   */
  register(config: CapsuleHubConfig): CapsuleHubClient {
    if (this.clients.has(config.name)) {
      console.warn(`Hub ${config.name} already registered`);
    }
    
    const client = new CapsuleHubClient(config, this.cacheBaseDir);
    this.clients.set(config.name, client);
    
    return client;
  }
  
  /**
   * 获取客户端
   */
  get(name: string): CapsuleHubClient | undefined {
    return this.clients.get(name);
  }
  
  /**
   * 移除 Hub
   */
  unregister(name: string): boolean {
    return this.clients.delete(name);
  }
  
  /**
   * 获取所有客户端
   */
  getAll(): CapsuleHubClient[] {
    return Array.from(this.clients.values());
  }
  
  /**
   * 跨 Hub 搜索
   */
  async searchAcrossAll(opts: HubSearchOptions = {}): Promise<
    Map<string, HubSearchResult>
  > {
    const results = new Map<string, HubSearchResult>();
    const clients = this.getAll().filter(c => c.hubConfig.enabled);
    
    // 并行搜索所有 Hub
    const promises = clients.map(async client => {
      const result = await client.search(opts);
      results.set(client.hubConfig.name, result);
    });
    
    await Promise.all(promises);
    
    return results;
  }
  
  /**
   * 从所有 Hub 下载胶囊
   */
  async downloadFromAny(capsuleId: string): Promise<{
    capsule: Capsule | null;
    source: string | null;
  }> {
    const clients = this.getAll().filter(c => c.hubConfig.enabled);
    
    for (const client of clients) {
      const capsule = await client.download(capsuleId);
      if (capsule) {
        return {
          capsule,
          source: client.hubConfig.name
        };
      }
    }
    
    return { capsule: null, source: null };
  }
  
  /**
   * 初始化所有客户端
   */
  async initAll(): Promise<void> {
    const clients = this.getAll();
    
    await Promise.all(clients.map(client => client.init()));
  }
}

// ============================================================================
// 预配置的公共 Hub
// ============================================================================

export const PUBLIC_HUBS: CapsuleHubConfig[] = [
  {
    name: 'evomap-official',
    url: 'https://hub.evomap.ai',
    validatedOnly: true,
    enabled: true
  },
  {
    name: 'community',
    url: 'https://community.evomap.ai',
    validatedOnly: false,
    enabled: true
  }
];
