# OpenCode LocalEvomap 集成指南

## 📋 概述

本目录包含 OpenCode 与远程 LocalEvomap 服务的集成配置。

## 📁 文件说明

- `localevomap.remote.json` - 远程服务配置
- `localevomap-skill/` - OpenCode 技能（待创建）

## 🔧 配置说明

### 1. 远程服务配置

已配置在 `localevomap.remote.json`：

```json
{
  "server": {
    "baseUrl": "http://10.104.11.12:3000"
  },
  "ssh": {
    "user": "itops",
    "host": "10.104.11.12",
    "appDir": "/home/itops/localevolmap"
  },
  "api": {
    "apiKey": "test-api-key"
  }
}
```

### 2. 在 OpenCode 中使用

#### 方式 A: 直接 HTTP API 调用

在 OpenCode 的 agent 或脚本中：

```typescript
// 导入配置
const config = require('./opencode/localevomap.remote.json');

const EVOMAP_API = config.server.baseUrl + '/api/v1';
const API_KEY = config.api.apiKey;

// 示例：获取基因
async function getGenes() {
  const response = await fetch(`${EVOMAP_API}/genes`);
  return response.json();
}

// 示例：创建基因
async function createGene(gene: any) {
  const response = await fetch(`${EVOMAP_API}/genes`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(gene)
  });
  return response.json();
}

// 示例：搜索胶囊
async function searchCapsules(signals: string[], minConfidence = 0.5) {
  const params = new URLSearchParams({
    signals: signals.join(','),
    minConfidence: minConfidence.toString()
  });
  const response = await fetch(
    `${EVOMAP_API}/capsules/search?${params}`,
    {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    }
  );
  return response.json();
}
```

#### 方式 B: 封装为 Helper 模块

创建 `lib/evomap-client.ts`：

```typescript
import config from '../opencode/localevomap.remote.json';

export class EvomapClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = config.server.baseUrl;
    this.apiKey = config.api.apiKey;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...options.headers,
      }
    });
    return response.json();
  }

  // 基因操作
  async getGenes(params?: { q?: string; category?: string; limit?: number }) {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return this.request(`/api/v1/genes${query}`);
  }

  async getGene(id: string) {
    return this.request(`/api/v1/genes/${id}`);
  }

  async createGene(gene: any) {
    return this.request('/api/v1/genes', {
      method: 'POST',
      body: JSON.stringify(gene)
    });
  }

  async deleteGene(id: string) {
    return this.request(`/api/v1/genes/${id}`, { method: 'DELETE' });
  }

  // 胶囊操作
  async searchCapsules(params?: { signals?: string[]; gene?: string; minConfidence?: number }) {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return this.request(`/api/v1/capsules/search${query}`);
  }

  async getCapsule(id: string) {
    return this.request(`/api/v1/capsules/${id}`);
  }

  async createCapsule(capsule: any) {
    return this.request('/api/v1/capsules', {
      method: 'POST',
      body: JSON.stringify(capsule)
    });
  }

  async deleteCapsule(id: string) {
    return this.request(`/api/v1/capsules/${id}`, { method: 'DELETE' });
  }

  // 事件操作
  async getEvents(params?: { limit?: number; offset?: number }) {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return this.request(`/api/v1/events${query}`);
  }

  async getEvent(id: string) {
    return this.request(`/api/v1/events/${id}`);
  }

  // 健康检查
  async healthCheck() {
    return this.request('/api/stats');
  }
}

export const evomap = new EvomapClient();
```

#### 方式 C: 在 Agent 中自动使用

在 agent 的 prompt 或技能中集成：

```typescript
// agent/evolution-agent.ts
import { evomap } from '../lib/evomap-client';

export async function evolutionAgent(logs: any[]) {
  // 1. 从日志提取信号
  const signals = extractSignals(logs);
  
  // 2. 搜索匹配的胶囊
  const capsules = await evomap.searchCapsules({ 
    signals, 
    minConfidence: 0.8 
  });
  
  // 3. 如果没有胶囊，选择基因
  if (capsules.total === 0) {
    const genes = await evomap.getGenes({ 
      category: 'repair' 
    });
    const selectedGene = selectGene(genes.genes, signals);
    
    // 4. 执行进化
    const changes = await executeEvolution(selectedGene, logs);
    
    // 5. 记录新的胶囊
    if (changes) {
      await evomap.createCapsule({
        type: 'Capsule',
        schema_version: '1.0.0',
        id: `capsule_${Date.now()}`,
        trigger: signals,
        gene: selectedGene.id,
        summary: 'Auto-generated from evolution',
        confidence: 0.7,
        blast_radius: { files: changes.files, lines: changes.lines },
        outcome: { status: 'success', score: 0.7 },
        env_fingerprint: { platform: 'linux', node_version: 'v20' }
      });
    }
  }
  
  return capsules.total > 0 ? capsules.capsules[0] : null;
}
```

## 🚀 快速开始

### 1. 测试连接

在 OpenCode 的终端中运行：

```bash
# 测试 API 连接
curl http://10.104.11.12:3000/api/stats

# 测试创建基因
curl -X POST http://10.104.11.12:3000/api/v1/genes \
  -H "Authorization: Bearer test-api-key" \
  -H "Content-Type: application/json" \
  -d '{"type":"Gene","id":"gene_test","category":"repair","signals_match":["error"],"preconditions":["test"],"strategy":["test"],"constraints":{}}'
```

### 2. 在代码中使用

```typescript
import { evomap } from './lib/evomap-client';

// 检查服务健康
const health = await evomap.healthCheck();
console.log('Evomap status:', health);

// 获取所有基因
const genes = await evomap.getGenes();
console.log('Total genes:', genes.total);

// 搜索胶囊
const capsules = await evomap.searchCapsules({ 
  signals: ['error', 'TypeError'],
  minConfidence: 0.8 
});
console.log('Matching capsules:', capsules.total);
```

## 📖 API 参考

### 基因 API

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/v1/genes` | 获取基因列表（支持 q, category, signal, limit, offset 参数） |
| GET | `/api/v1/genes/:id` | 获取单个基因 |
| POST | `/api/v1/genes` | 创建基因（需要认证） |
| DELETE | `/api/v1/genes/:id` | 软删除基因（需要认证） |

### 胶囊 API

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/v1/capsules/search` | 搜索胶囊（支持 signals, gene, minConfidence, limit 参数） |
| GET | `/api/v1/capsules/:id` | 获取单个胶囊 |
| POST | `/api/v1/capsules` | 创建胶囊（需要认证） |
| DELETE | `/api/v1/capsules/:id` | 软删除胶囊（需要认证） |

### 事件 API

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/v1/events` | 获取事件列表（支持 limit, offset 参数） |
| GET | `/api/v1/events/:id` | 获取单个事件 |

## 🔐 认证

所有写操作需要 Bearer Token：

```typescript
headers: {
  'Authorization': 'Bearer test-api-key'
}
```

默认 API Key: `test-api-key`
可通过环境变量 `HUB_API_KEY` 修改。

## 📊 使用场景

### 场景 1: 错误修复

```typescript
// 当遇到错误时，搜索已有的修复胶囊
const errorLogs = [{ error: 'TypeError: undefined is not a function' }];
const signals = extractSignals(errorLogs); // ['error', 'TypeError', 'undefined']

const capsules = await evomap.searchCapsules({ 
  signals, 
  minConfidence: 0.8 
});

if (capsules.total > 0) {
  // 使用已有的修复方案
  const capsule = capsules.capsules[0];
  console.log('Found fix:', capsule.summary);
} else {
  // 没有胶囊，选择基因并执行进化
  const genes = await evomap.getGenes({ category: 'repair' });
  const gene = selectBestGene(genes.genes, signals);
  // 执行进化逻辑...
}
```

### 场景 2: 性能优化

```typescript
// 搜索性能相关的胶囊
const perfCapsules = await evomap.searchCapsules({ 
  signals: ['slow', 'performance', 'timeout'],
  minConfidence: 0.9 
});

// 获取性能优化基因
const perfGenes = await evomap.getGenes({ category: 'performance' });
```

### 场景 3: 记录新的解决方案

```typescript
// 当找到新的修复方案时，记录为胶囊
await evomap.createCapsule({
  type: 'Capsule',
  schema_version: '1.0.0',
  id: `capsule_${Date.now()}`,
  trigger: ['TypeError', 'undefined'],
  gene: 'gene_repair_type_error',
  summary: 'Fixed undefined function call by adding null check',
  confidence: 0.85,
  blast_radius: { files: 1, lines: 5 },
  outcome: { status: 'success', score: 0.9, duration_ms: 1200 },
  env_fingerprint: {
    platform: 'linux',
    node_version: 'v20.10.0',
    working_dir: '/home/user/project'
  },
  metadata: {
    created_at: new Date().toISOString(),
    source: 'local',
    validated: true
  }
});
```

## 🛠️ 故障排查

### 问题：API 返回 401

**原因**: API Key 不正确或认证头缺失

**解决**:
```typescript
// 确保认证头正确
headers: {
  'Authorization': 'Bearer test-api-key',  // 注意 Bearer 和空格
  'Content-Type': 'application/json'
}
```

### 问题：无法连接到服务器

**原因**: 网络问题或服务器未运行

**解决**:
```bash
# 检查服务器状态
ssh itops@10.104.11.12 "curl -s http://localhost:3000/api/stats"

# 查看服务器进程
ssh itops@10.104.11.12 "ps aux | grep 'node.*dist/server'"
```

### 问题：创建失败

**原因**: JSON 格式错误或缺少必填字段

**解决**: 检查 Gene/Capsule schema，确保所有必填字段都存在。

## 📚 更多信息

- 完整 API 文档：`docs/HTTP_API.md`
- 部署文档：`docs/DEPLOYMENT_OPENCODE.md`
- 使用指南：`HOW_TO_USE.md`
