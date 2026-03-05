/**
 * LocalEvomap Remote Client
 * 
 * 用于在 OpenCode 中调用远程 LocalEvomap 服务
 */

import config from '../opencode/localevomap.remote.json';

export interface Gene {
  type: 'Gene';
  id: string;
  category: string;
  signals_match: string[];
  preconditions: string[];
  strategy: string[];
  constraints: {
    max_files?: number;
    max_lines?: number;
    forbidden_paths?: string[];
    required_paths?: string[];
    timeout_ms?: number;
  };
  validation?: string[];
  metadata?: {
    author?: string;
    created_at?: string;
    updated_at?: string;
    version?: string;
    description?: string;
    tags?: string[];
  };
  _deleted?: boolean;
  _deleted_at?: string;
}

export interface Capsule {
  type: 'Capsule';
  schema_version: string;
  id: string;
  trigger: string[];
  gene: string;
  summary: string;
  confidence: number;
  blast_radius: {
    files: number;
    lines: number;
    directories?: string[];
  };
  outcome: {
    status: 'success' | 'failed' | 'partial' | 'skipped';
    score: number;
    duration_ms?: number;
    error_message?: string;
  };
  env_fingerprint: {
    node_version?: string;
    platform: 'linux' | 'darwin' | 'win32';
    arch: 'x64' | 'arm64' | 'ia32';
    working_dir?: string;
    git_branch?: string;
    git_commit?: string;
    [key: string]: unknown;
  };
  metadata?: {
    created_at: string;
    applied_at?: string;
    session_id?: string;
    user_id?: string;
    source?: 'local' | 'external' | 'hub';
    validated?: boolean;
  };
  _deleted?: boolean;
  _deleted_at?: string;
}

export interface EvolutionEvent {
  id: string;
  timestamp: string;
  signals: string[];
  selected_gene: string;
  used_capsule?: string;
  outcome: {
    status: 'success' | 'failed' | 'partial' | 'skipped';
    score: number;
    changes: {
      files_modified: number;
      lines_added: number;
      lines_removed: number;
    };
  };
  validation: {
    passed: boolean;
    commands_run: number;
    errors?: string[];
  };
  metadata?: {
    session_id: string;
    [key: string]: unknown;
  };
}

export interface GenesListResponse {
  total: number;
  offset: number;
  limit: number;
  genes: Gene[];
  categories: string[];
}

export interface CapsulesSearchResponse {
  total: number;
  capsules: Capsule[];
  tags: string[];
  genes: string[];
}

export interface EventsListResponse {
  total: number;
  offset: number;
  limit: number;
  events: EvolutionEvent[];
}

export class EvomapClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(options?: { baseUrl?: string; apiKey?: string }) {
    this.baseUrl = options?.baseUrl || config.server.baseUrl;
    this.apiKey = options?.apiKey || config.api.apiKey;
  }

  /**
   * 发送 HTTP 请求
   */
  private async request(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // 写操作需要认证
    if (options.method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method)) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(url, { ...options, headers });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API Error ${response.status}: ${error}`);
      }

      return response.json();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('API Error')) {
        throw error;
      }
      throw new Error(`Request failed: ${error}`);
    }
  }

  // ==================== 基因操作 ====================

  /**
   * 获取基因列表
   */
  async getGenes(params?: {
    q?: string;
    category?: string;
    signal?: string;
    limit?: number;
    offset?: number;
  }): Promise<GenesListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.q) searchParams.set('q', params.q);
    if (params?.category) searchParams.set('category', params.category);
    if (params?.signal) searchParams.set('signal', params.signal);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());

    const query = searchParams.toString();
    const endpoint = query ? `/api/v1/genes?${query}` : '/api/v1/genes';
    return this.request(endpoint);
  }

  /**
   * 获取单个基因
   */
  async getGene(id: string): Promise<Gene> {
    return this.request(`/api/v1/genes/${encodeURIComponent(id)}`);
  }

  /**
   * 创建基因
   */
  async createGene(gene: Omit<Gene, '_deleted' | '_deleted_at'>): Promise<{ message: string; id: string }> {
    return this.request('/api/v1/genes', {
      method: 'POST',
      body: JSON.stringify(gene),
    });
  }

  /**
   * 软删除基因
   */
  async deleteGene(id: string): Promise<{ message: string; id: string }> {
    return this.request(`/api/v1/genes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // ==================== 胶囊操作 ====================

  /**
   * 搜索胶囊
   */
  async searchCapsules(params?: {
    signals?: string[];
    gene?: string;
    minConfidence?: number;
    limit?: number;
  }): Promise<CapsulesSearchResponse> {
    const searchParams = new URLSearchParams();
    if (params?.signals) searchParams.set('signals', params.signals.join(','));
    if (params?.gene) searchParams.set('gene', params.gene);
    if (params?.minConfidence) searchParams.set('minConfidence', params.minConfidence.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    const endpoint = query ? `/api/v1/capsules/search?${query}` : '/api/v1/capsules/search';
    return this.request(endpoint);
  }

  /**
   * 获取单个胶囊
   */
  async getCapsule(id: string): Promise<Capsule> {
    return this.request(`/api/v1/capsules/${encodeURIComponent(id)}`);
  }

  /**
   * 创建胶囊
   */
  async createCapsule(
    capsule: Omit<Capsule, '_deleted' | '_deleted_at'>
  ): Promise<{ message: string; id: string }> {
    return this.request('/api/v1/capsules', {
      method: 'POST',
      body: JSON.stringify(capsule),
    });
  }

  /**
   * 软删除胶囊
   */
  async deleteCapsule(id: string): Promise<{ message: string; id: string }> {
    return this.request(`/api/v1/capsules/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // ==================== 事件操作 ====================

  /**
   * 获取事件列表
   */
  async getEvents(params?: {
    limit?: number;
    offset?: number;
  }): Promise<EventsListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());

    const query = searchParams.toString();
    const endpoint = query ? `/api/v1/events?${query}` : '/api/v1/events';
    return this.request(endpoint);
  }

  /**
   * 获取单个事件
   */
  async getEvent(id: string): Promise<EvolutionEvent> {
    return this.request(`/api/v1/events/${encodeURIComponent(id)}`);
  }

  // ==================== 工具方法 ====================

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{ genes: number; capsules: number; events: number }> {
    return this.request('/api/stats');
  }

  /**
   * 重置状态（legacy API）
   */
  async reset(): Promise<{ message: string }> {
    return this.request('/api/reset', { method: 'POST' });
  }

  /**
   * 获取所有类别
   */
  async getCategories(): Promise<string[]> {
    const response = await this.getGenes();
    return response.categories;
  }

  /**
   * 根据信号搜索最佳基因
   */
  async findBestGeneForSignals(signals: string[]): Promise<Gene | null> {
    const response = await this.getGenes();
    
    // 简单匹配：找信号匹配最多的基因
    let bestGene: Gene | null = null;
    let maxMatches = 0;

    for (const gene of response.genes) {
      if (gene._deleted) continue;

      const matches = signals.filter(signal =>
        gene.signals_match.some(pattern =>
          pattern.toLowerCase().includes(signal.toLowerCase())
        )
      ).length;

      if (matches > maxMatches) {
        maxMatches = matches;
        bestGene = gene;
      }
    }

    return bestGene;
  }

  /**
   * 根据信号搜索最佳胶囊
   */
  async findBestCapsuleForSignals(
    signals: string[],
    minConfidence: number = 0.5
  ): Promise<Capsule | null> {
    const response = await this.searchCapsules({
      signals,
      minConfidence,
      limit: 10
    });

    if (response.capsules.length === 0) {
      return null;
    }

    // 返回置信度最高的胶囊
    return response.capsules.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );
  }
}

// 导出默认实例
export const evomap = new EvomapClient();

export default evomap;
