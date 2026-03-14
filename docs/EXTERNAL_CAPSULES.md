# External Capsule Source - 外部胶囊源使用指南

## 配置外部 Hub

### 1. 基本配置

```typescript
import { LocalEvomap, PUBLIC_HUBS } from './index';

// 使用预配置的公共 Hub
const evomap = new LocalEvomap({
  // ... 其他配置
  externalSources: PUBLIC_HUBS
});

await evomap.init();
```

### 2. 自定义 Hub 配置

```typescript
import { LocalEvomap } from './index';

const evomap = new LocalEvomap({
  externalSources: [
    {
      name: 'my-company-hub',
      url: 'https://capsules.mycompany.com',
      validatedOnly: true,  // 只使用已验证的胶囊
      apiKey: 'your-api-key-here',  // 可选
      timeoutMs: 30000,
      enabled: true
    },
    {
      name: 'community-hub',
      url: 'https://community.evomap.ai',
      validatedOnly: false,  // 允许未验证的胶囊
      enabled: true
    }
  ]
});
```

## 搜索外部胶囊

### 按信号搜索

```typescript
// 搜索与特定信号匹配的胶囊
const results = await evomap.searchExternalCapsules({
  signals: ['log_error', 'type_error'],
  minConfidence: 0.7,
  validatedOnly: true,
  sortBy: 'downloads',
  sortOrder: 'desc',
  limit: 20
});

// results 是一个 Map<hubName, HubSearchResult>
for (const [hubName, result] of results) {
  console.log(`\n${hubName}: ${result.total} capsules`);
  result.capsules.forEach(c => {
    console.log(`  - ${c.id}: ${c.summary} (confidence: ${c.confidence})`);
  });
}
```

### 按基因搜索

```typescript
const results = await evomap.searchExternalCapsules({
  gene: 'gene_repair_type_errors',
  platform: 'win32',
  arch: 'x64'
});
```

### 跨 Hub 搜索

```typescript
// 自动在所有配置的 Hub 中搜索
const allResults = await evomap.searchExternalCapsules({
  signals: ['performance', 'slow'],
  limit: 10
});

// 汇总所有结果
let total = 0;
for (const [hubName, result] of allResults) {
  total += result.capsules.length;
}
console.log(`Found ${total} capsules across all hubs`);
```

## 下载胶囊

### 下载单个胶囊

```typescript
// 自动从所有 Hub 中查找并下载
const result = await evomap.downloadExternalCapsule('capsule_123456');

if (result.capsule) {
  console.log(`Downloaded from: ${result.source}`);
  console.log(`Summary: ${result.capsule.summary}`);
} else {
  console.log('Capsule not found in any hub');
}
```

### 批量下载

```typescript
const capsuleIds = ['capsule_1', 'capsule_2', 'capsule_3'];
const downloaded: any[] = [];

for (const id of capsuleIds) {
  const result = await evomap.downloadExternalCapsule(id);
  if (result.capsule) {
    downloaded.push(result.capsule);
  }
}

console.log(`Downloaded ${downloaded.length}/${capsuleIds.length} capsules`);
```

## 同步胶囊

### 按需同步

```typescript
// 同步与当前信号匹配的胶囊
const currentSignals = ['log_error', 'type_error', 'undefined'];
const count = await evomap.syncExternalCapsules(currentSignals);

console.log(`Synced ${count} new capsules`);
```

### 全量同步

```typescript
// 同步所有胶囊（不指定信号）
const count = await evomap.syncExternalCapsules();

console.log(`Synced ${count} capsules`);
```

## 缓存管理

### 刷新缓存

```typescript
// 刷新所有 Hub 的缓存
await evomap.refreshHubCache();

// 刷新指定 Hub 的缓存
await evomap.refreshHubCache('evomap-official');
```

### 清理缓存

```typescript
import { HubRegistry } from './index';

const registry = new HubRegistry('./.evocache');
const client = registry.register({
  name: 'test-hub',
  url: 'https://example.com',
  enabled: true
});

await client.init();
await client.clearCache();
```

## 完整工作流示例

```typescript
import { LocalEvomap, PUBLIC_HUBS } from './index';

async function demonstrateExternalCapsules() {
  // 1. 初始化
  const evomap = new LocalEvomap({
    externalSources: PUBLIC_HUBS,
    review_mode: false  // 测试时关闭审批
  });
  
  await evomap.init();
  
  // 2. 模拟错误日志
  const logs = [
    {
      type: 'tool_result',
      error: {
        code: 'TS2339',
        message: "Property 'xyz' does not exist on type 'Object'"
      },
      timestamp: new Date().toISOString()
    }
  ];
  
  // 3. 提取信号
  const signals = evomap.extractSignals(logs);
  console.log('Signals:', signals);
  
  // 4. 搜索外部胶囊
  console.log('\nSearching external capsules...');
  const searchResults = await evomap.searchExternalCapsules({
    signals,
    minConfidence: 0.6,
    limit: 5
  });
  
  // 5. 显示搜索结果
  for (const [hubName, result] of searchResults) {
    console.log(`\n${hubName}:`);
    result.capsules.slice(0, 3).forEach(c => {
      console.log(`  ${c.id}: ${c.summary}`);
    });
  }
  
  // 6. 下载最佳匹配
  if (searchResults.size > 0) {
    const firstHub = Array.from(searchResults.values())[0];
    if (firstHub.capsules.length > 0) {
      const bestCapsule = firstHub.capsules[0];
      console.log(`\nDownloading ${bestCapsule.id}...`);
      
      const result = await evomap.downloadExternalCapsule(bestCapsule.id);
      if (result.capsule) {
        console.log('Download successful!');
      }
    }
  }
  
  // 7. 执行进化
  console.log('\nExecuting evolution...');
  const event = await evomap.evolve(logs);
  console.log('Evolution event:', event);
}

demonstrateExternalCapsules().catch(console.error);
```

## 部署自己的 Hub

### Hub 服务器要求

你的 Hub 服务器需要实现以下 API：

#### 1. 搜索 API

```
GET /api/v1/capsules/search

Query Parameters:
- signals: comma-separated signal names
- gene: gene ID filter
- tags: comma-separated tags
- minConfidence: minimum confidence threshold
- validatedOnly: boolean
- platform: platform filter (linux, win32, darwin)
- arch: architecture filter (x64, arm64)
- sortBy: downloads | rating | createdAt | confidence
- sortOrder: asc | desc
- limit: number (default: 20)
- offset: number (default: 0)

Response:
{
  "total": 100,
  "capsules": [
    {
      "id": "capsule_123",
      "version": "1.0.0",
      "gene": "gene_repair_errors",
      "trigger": ["log_error", "type_error"],
      "summary": "Fixes TypeScript type errors",
      "confidence": 0.85,
      "downloadUrl": "https://hub.example.com/api/v1/capsules/capsule_123/download",
      "checksum": "sha256:abc123...",
      "validated": true,
      "downloads": 1234,
      "rating": 4.5,
      "environments": [...],
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-02T00:00:00Z"
    }
  ],
  "tags": ["typescript", "error", "repair"],
  "genes": ["gene_repair_errors", "gene_optimize_performance"]
}
```

#### 2. 获取胶囊详情

```
GET /api/v1/capsules/:id

Response: Same as capsule object in search results
```

#### 3. 下载胶囊

```
GET /api/v1/capsules/:id/download

Response: Full Capsule JSON object
{
  "type": "Capsule",
  "schema_version": "1.5.0",
  "id": "capsule_123",
  ...
}
```

### 参考实现

见 `examples/hub-server.ts` - 一个简单的 Hub 服务器实现。

## 安全考虑

1. **验证模式**: 设置 `validatedOnly: true` 只使用已验证的胶囊
2. **API 密钥**: 保护私有 Hub 使用 API 密钥认证
3. **校验和验证**: 客户端自动验证下载的胶囊完整性
4. **超时控制**: 防止挂起的 HTTP 请求
5. **来源限制**: 只信任已配置的 Hub

## 故障排除

### 问题：搜索返回空结果

```typescript
// 检查 Hub 是否启用
const hubs = evomap.getConfig().externalSources;
console.log('Enabled hubs:', hubs.filter(h => h.enabled).map(h => h.name));

// 手动测试 API
fetch('https://hub.example.com/api/v1/capsules/search?limit=1')
  .then(r => r.json())
  .then(console.log);
```

### 问题：下载失败

```typescript
// 检查网络连接
// 检查 API 密钥是否正确
// 检查胶囊 ID 是否存在

const result = await evomap.downloadExternalCapsule('capsule_123');
if (!result.capsule) {
  console.log('Capsule not found or download failed');
}
```

### 问题：缓存问题

```typescript
// 清理并刷新缓存
await evomap.refreshHubCache();
```
