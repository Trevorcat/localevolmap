/**
 * Simple Capsule Hub Server - 示例 Hub 服务器实现
 * 
 * 这是一个简单的 HTTP 服务器，演示如何实现 Capsule Hub API
 * 用于本地测试和开发
 * 
 * 运行：npx ts-node examples/hub-server.ts
 */

import http from 'http';
import url from 'url';
import type { ParsedUrlQuery } from 'querystring';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Capsule } from '../types/gene-capsule-schema';

// ============================================================================
// 示例胶囊数据
// ============================================================================

const SAMPLE_CAPSULES: Capsule[] = [
  {
    type: 'Capsule',
    schema_version: '1.5.0',
    id: 'capsule_type_error_fix',
    trigger: ['log_error', 'type_error', 'undefined'],
    gene: 'gene_repair_type_errors',
    summary: 'Fixes TypeScript property access errors',
    confidence: 0.85,
    blast_radius: { files: 1, lines: 5 },
    outcome: { status: 'success', score: 0.9 },
    env_fingerprint: {
      node_version: 'v20.0.0',
      platform: 'linux',
      arch: 'x64'
    },
    metadata: {
      created_at: '2024-01-01T00:00:00Z',
      source: 'hub'
    }
  },
  {
    type: 'Capsule',
    schema_version: '1.5.0',
    id: 'capsule_null_check',
    trigger: ['log_error', 'null', 'cannot read property'],
    gene: 'gene_repair_null_errors',
    summary: 'Adds null checks for object properties',
    confidence: 0.9,
    blast_radius: { files: 2, lines: 10 },
    outcome: { status: 'success', score: 0.95 },
    env_fingerprint: {
      node_version: 'v20.0.0',
      platform: 'win32',
      arch: 'x64'
    },
    metadata: {
      created_at: '2024-01-02T00:00:00Z',
      source: 'hub'
    }
  },
  {
    type: 'Capsule',
    schema_version: '1.5.0',
    id: 'capsule_perf_optimize',
    trigger: ['perf_bottleneck', 'slow'],
    gene: 'gene_optimize_performance',
    summary: 'Optimizes loop performance',
    confidence: 0.75,
    blast_radius: { files: 1, lines: 20 },
    outcome: { status: 'success', score: 0.8 },
    env_fingerprint: {
      node_version: 'v20.0.0',
      platform: 'darwin',
      arch: 'arm64'
    },
    metadata: {
      created_at: '2024-01-03T00:00:00Z',
      source: 'hub'
    }
  }
];

// ============================================================================
// 服务器配置
// ============================================================================

const CONFIG = {
  port: process.env.PORT || 3000,
  apiKey: process.env.HUB_API_KEY || 'test-api-key',
  baseDataDir: './hub-data'
};

// ============================================================================
// 请求处理
// ============================================================================

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url || '/', true);
  const pathname = parsedUrl.pathname || '/';
  const query = parsedUrl.query;
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  try {
    // API Routes
    if (pathname === '/api/v1/capsules/search') {
      await handleSearch(req, res, query);
    } else if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    } else if (pathname.startsWith('/api/v1/capsules/')) {
      const parts = pathname.split('/');
      const capsuleId = parts[parts.length - 2];
      
      if (parts[parts.length - 1] === 'download') {
        await handleDownload(req, res, capsuleId);
      } else {
        await handleGetManifest(req, res, capsuleId);
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
    
  } catch (error) {
    console.error('Request error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

/**
 * 处理搜索请求
 */
async function handleSearch(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  query: ParsedUrlQuery
): Promise<void> {
  // API 密钥验证（可选）
  const authHeader = req.headers.authorization;
  if (CONFIG.apiKey && authHeader !== `Bearer ${CONFIG.apiKey}`) {
    // 搜索 API 允许匿名访问
  }
  
  // 解析查询参数
  const signals = query.signals?.toString().split(',') || [];
  const gene = query.gene?.toString();
  const minConfidence = query.minConfidence ? parseFloat(query.minConfidence.toString()) : 0;
  const validatedOnly = query.validatedOnly === 'true';
  const platform = query.platform?.toString();
  const arch = query.arch?.toString();
  const limit = query.limit ? parseInt(query.limit.toString()) : 20;
  const offset = query.offset ? parseInt(query.offset.toString()) : 0;
  
  // 过滤胶囊
  let results = SAMPLE_CAPSULES.filter(capsule => {
    // 信号过滤
    if (signals.length > 0) {
      const hasSignalMatch = signals.some((signal: string) =>
        capsule.trigger.some(t => t.toLowerCase().includes(signal.toLowerCase()))
      );
      if (!hasSignalMatch) return false;
    }
    
    // 基因过滤
    if (gene && capsule.gene !== gene) return false;
    
    // 置信度过滤
    if (capsule.confidence < minConfidence) return false;
    
    // 验证状态过滤
    if (validatedOnly && !capsule.metadata?.validated) return false;
    
    // 环境过滤
    if (platform && capsule.env_fingerprint.platform !== platform) return false;
    if (arch && capsule.env_fingerprint.arch !== arch) return false;
    
    return true;
  });
  
  // 排序
  const sortBy = query.sortBy?.toString() || 'downloads';
  const sortOrder = query.sortOrder?.toString() || 'desc';
  
  results.sort((a, b) => {
    let cmp = 0;
    
    switch (sortBy) {
      case 'confidence':
        cmp = a.confidence - b.confidence;
        break;
      case 'downloads':
        cmp = getDownloads(a) - getDownloads(b);
        break;
      default:
        cmp = 0;
    }
    
    return sortOrder === 'desc' ? -cmp : cmp;
  });
  
  const total = results.length;
  results = results.slice(offset, offset + limit);
  
  // 构建响应
  const manifests = results.map(capsule => ({
    id: capsule.id,
    version: '1.0.0',
    gene: capsule.gene,
    trigger: capsule.trigger,
    summary: capsule.summary,
    confidence: capsule.confidence,
    downloadUrl: `http://localhost:${CONFIG.port}/api/v1/capsules/${capsule.id}/download`,
    checksum: calculateChecksum(capsule),
    validated: capsule.metadata?.validated || false,
    downloads: getDownloads(capsule),
    rating: 4.5,
    environments: [
      {
        platform: capsule.env_fingerprint.platform,
        arch: capsule.env_fingerprint.arch,
        node_version: capsule.env_fingerprint.node_version
      }
    ],
    createdAt: capsule.metadata?.created_at || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    total,
    capsules: manifests,
    tags: ['typescript', 'error', 'performance', 'repair'],
    genes: ['gene_repair_type_errors', 'gene_repair_null_errors', 'gene_optimize_performance']
  }));
}

/**
 * 获取胶囊详情
 */
async function handleGetManifest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  capsuleId: string
): Promise<void> {
  const capsule = SAMPLE_CAPSULES.find(c => c.id === capsuleId);
  
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
    downloadUrl: `http://localhost:${CONFIG.port}/api/v1/capsules/${capsule.id}/download`,
    checksum: calculateChecksum(capsule),
    validated: capsule.metadata?.validated || false,
    downloads: getDownloads(capsule),
    rating: 4.5,
    environments: [
      {
        platform: capsule.env_fingerprint.platform,
        arch: capsule.env_fingerprint.arch,
        node_version: capsule.env_fingerprint.node_version
      }
    ],
    createdAt: capsule.metadata?.created_at || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(manifest));
}

/**
 * 下载胶囊
 */
async function handleDownload(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  capsuleId: string
): Promise<void> {
  // API 密钥验证
  const authHeader = req.headers.authorization;
  if (CONFIG.apiKey && authHeader !== `Bearer ${CONFIG.apiKey}`) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }
  
  const capsule = SAMPLE_CAPSULES.find(c => c.id === capsuleId);
  
  if (!capsule) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Capsule not found' }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(capsule, null, 2));
}

/**
 * 计算校验和
 */
function calculateChecksum(capsule: Capsule): string {
  const content = JSON.stringify(capsule);
  return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
}

function getDownloads(capsule: Capsule): number {
  const value = (capsule.metadata as Record<string, unknown> | undefined)?.downloads;
  return typeof value === 'number' ? value : 0;
}

// ============================================================================
// 启动服务器
// ============================================================================

server.listen(CONFIG.port, () => {
  console.log(`\n🚀 Capsule Hub Server running`);
  console.log(`   Port: ${CONFIG.port}`);
  console.log(`   API Key: ${CONFIG.apiKey}`);
  console.log(`\n📋 Available endpoints:`);
  console.log(`   GET  /health`);
  console.log(`   GET  /api/v1/capsules/search`);
  console.log(`   GET  /api/v1/capsules/:id`);
  console.log(`   GET  /api/v1/capsules/:id/download`);
  console.log(`\n📦 Sample capsules: ${SAMPLE_CAPSULES.length}`);
  SAMPLE_CAPSULES.forEach(c => {
    console.log(`   - ${c.id}: ${c.summary}`);
  });
  console.log(`\n💡 Test with:`);
  console.log(`   curl http://localhost:${CONFIG.port}/health`);
  console.log(`   curl "http://localhost:${CONFIG.port}/api/v1/capsules/search?limit=10"`);
  console.log(`\n`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
