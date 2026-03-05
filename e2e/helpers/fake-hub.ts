/**
 * Fake Hub 管理器
 *
 * 在测试进程内启动轻量 HTTP 服务器，模拟 Capsule Hub API
 * 使用随机端口避免冲突，支持多种响应场景配置
 */

import * as http from 'http';
import * as net from 'net';
import * as crypto from 'crypto';
import type { Capsule } from '../../types/gene-capsule-schema';

// ============================================================================
// 响应场景类型
// ============================================================================

export type FakeHubScenario =
  | 'normal'        // 正常返回胶囊列表
  | 'empty'         // 返回空胶囊列表
  | 'error'         // 服务器内部错误
  | 'unauthorized'  // 401 未授权
  | 'slow';         // 延迟响应（用于超时测试）

// ============================================================================
// 测试用胶囊数据
// ============================================================================

const DEFAULT_CAPSULES: Capsule[] = [
  {
    type: 'Capsule',
    schema_version: '1.5.0',
    id: 'capsule_hub_type_error_fix',
    trigger: ['log_error', 'type_error', 'error'],
    gene: 'gene_e2e_repair_errors',
    summary: 'Hub capsule: fixes type errors',
    confidence: 0.88,
    blast_radius: { files: 1, lines: 5 },
    outcome: { status: 'success', score: 0.9, duration_ms: 400 },
    env_fingerprint: { node_version: 'v20.0.0', platform: 'win32', arch: 'x64' },
    metadata: { created_at: '2024-01-01T00:00:00Z', source: 'hub', validated: true }
  },
  {
    type: 'Capsule',
    schema_version: '1.5.0',
    id: 'capsule_hub_null_check',
    trigger: ['log_error', 'null', 'undefined'],
    gene: 'gene_e2e_repair_errors',
    summary: 'Hub capsule: adds null checks',
    confidence: 0.92,
    blast_radius: { files: 2, lines: 10 },
    outcome: { status: 'success', score: 0.95, duration_ms: 600 },
    env_fingerprint: { node_version: 'v20.0.0', platform: 'win32', arch: 'x64' },
    metadata: { created_at: '2024-01-02T00:00:00Z', source: 'hub', validated: true }
  }
];

// ============================================================================
// FakeHub 类
// ============================================================================

export class FakeHub {
  private server: http.Server;
  private port: number = 0;
  private scenario: FakeHubScenario = 'normal';
  private capsules: Capsule[] = [...DEFAULT_CAPSULES];
  readonly apiKey: string;

  constructor() {
    this.apiKey = 'fake-hub-test-key';
    this.server = this.createServer();
  }

  private createServer(): http.Server {
    return http.createServer((req, res) => {
      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // 场景路由
      switch (this.scenario) {
        case 'error':
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
          return;

        case 'unauthorized':
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;

        case 'slow':
          // 延迟 5 秒再响应（用于超时测试）
          setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ total: 0, capsules: [], tags: [], genes: [] }));
          }, 5000);
          return;
      }

      const urlParts = (req.url || '').split('?');
      const pathname = urlParts[0];

      // Health check
      if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        return;
      }

      // 搜索接口
      if (pathname === '/api/v1/capsules/search') {
        this.handleSearch(req, res);
        return;
      }

      // 下载接口
      const downloadMatch = pathname.match(/^\/api\/v1\/capsules\/(.+)\/download$/);
      if (downloadMatch) {
        this.handleDownload(res, downloadMatch[1]);
        return;
      }

      // 详情接口
      const detailMatch = pathname.match(/^\/api\/v1\/capsules\/(.+)$/);
      if (detailMatch) {
        this.handleGetCapsule(res, detailMatch[1]);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });
  }

  private handleSearch(_req: http.IncomingMessage, res: http.ServerResponse): void {
    const list = this.scenario === 'empty' ? [] : this.capsules;

    const manifests = list.map(c => ({
      id: c.id,
      version: '1.0.0',
      gene: c.gene,
      trigger: c.trigger,
      summary: c.summary,
      confidence: c.confidence,
      downloadUrl: `http://localhost:${this.port}/api/v1/capsules/${c.id}/download`,
      checksum: 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex'),
      validated: c.metadata?.validated ?? false,
      downloads: 0,
      rating: 4.5,
      environments: [{ platform: c.env_fingerprint.platform, arch: c.env_fingerprint.arch }],
      createdAt: c.metadata?.created_at ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ total: manifests.length, capsules: manifests, tags: [], genes: [] }));
  }

  private handleDownload(res: http.ServerResponse, capsuleId: string): void {
    const capsule = this.capsules.find(c => c.id === capsuleId);
    if (!capsule) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Capsule not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(capsule, null, 2));
  }

  private handleGetCapsule(res: http.ServerResponse, capsuleId: string): void {
    const capsule = this.capsules.find(c => c.id === capsuleId);
    if (!capsule) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Capsule not found' }));
      return;
    }
    const manifest = {
      id: capsule.id,
      version: '1.0.0',
      gene: capsule.gene,
      trigger: capsule.trigger,
      summary: capsule.summary,
      confidence: capsule.confidence,
      downloadUrl: `http://localhost:${this.port}/api/v1/capsules/${capsule.id}/download`,
      checksum: 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(capsule)).digest('hex'),
      validated: capsule.metadata?.validated ?? false,
      downloads: 0,
      rating: 4.5,
      environments: [{ platform: capsule.env_fingerprint.platform, arch: capsule.env_fingerprint.arch }],
      createdAt: capsule.metadata?.created_at ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(manifest));
  }

  // ============================================================================
  // 公共 API
  // ============================================================================

  /**
   * 启动 Fake Hub 服务（随机端口）
   */
  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
          resolve(this.port);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });
      this.server.on('error', reject);
    });
  }

  /**
   * 停止 Fake Hub 服务
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close(err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * 配置响应场景
   */
  configureResponse(scenario: FakeHubScenario): void {
    this.scenario = scenario;
  }

  /**
   * 重置为正常场景
   */
  reset(): void {
    this.scenario = 'normal';
    this.capsules = [...DEFAULT_CAPSULES];
  }

  /**
   * 添加自定义胶囊
   */
  addCapsule(capsule: Capsule): void {
    this.capsules.push(capsule);
  }

  /**
   * 获取服务 URL
   */
  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /**
   * 获取端口
   */
  get listenPort(): number {
    return this.port;
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 启动 Fake Hub（便捷包装）
 */
export async function startFakeHub(): Promise<FakeHub> {
  const hub = new FakeHub();
  await hub.start();
  return hub;
}

/**
 * 停止 Fake Hub（便捷包装）
 */
export async function stopFakeHub(hub: FakeHub): Promise<void> {
  await hub.stop();
}

/**
 * 获取一个随机可用端口（辅助函数）
 */
export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}
