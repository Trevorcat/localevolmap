# 🚀 在 OpenCode/Claude Code 中有效利用 LocalEvomap

## 📖 概述

LocalEvomap 是一个**本地进化系统**，帮助你在编码过程中：
- **自动搜索**已验证的解决方案（胶囊）
- **获取策略建议**（基因）
- **记录新方案**供未来复用
- **追踪进化历史**

## 🎯 核心概念

### 基因 (Genes)
抽象的知识模式，编码"如何响应特定信号"的知识
- **category**: repair, performance, security, testing 等
- **signals_match**: 匹配的错误信号
- **strategy**: 解决策略
- **constraints**: 约束条件

### 胶囊 (Capsules)
具体、已验证的解决方案，可跨环境复用
- **trigger**: 触发信号
- **summary**: 解决方案摘要
- **confidence**: 信心度 (0-1)
- **outcome**: 执行结果

## 🔧 三种使用方式

### 方式 1: 直接 API 调用（最简单）

在 OpenCode 的对话中直接调用 API：

```typescript
// 在 OpenCode 的终端或代码块中运行
const response = await fetch('http://10.104.11.12:3000/api/v1/capsules/search?signals=TypeError,undefined&minConfidence=0.7');
const capsules = await response.json();
console.log('Found capsules:', capsules.total);
```

**适用场景**: 快速测试、一次性查询

---

### 方式 2: 使用客户端库（推荐）

项目已提供 TypeScript 客户端库 `lib/evomap-client.ts`：

```typescript
import { evomap } from './lib/evomap-client';

// 1. 搜索胶囊
const capsules = await evomap.searchCapsules({ 
  signals: ['TypeError', 'undefined'],
  minConfidence: 0.8 
});

// 2. 获取基因
const genes = await evomap.getGenes({ category: 'repair' });

// 3. 创建胶囊
await evomap.createCapsule({
  type: 'Capsule',
  schema_version: '1.0.0',
  id: `capsule_${Date.now()}`,
  trigger: ['TypeError'],
  gene: 'gene_repair',
  summary: 'Fixed by adding null check',
  confidence: 0.85,
  blast_radius: { files: 1, lines: 5 },
  outcome: { status: 'success', score: 0.9 }
});
```

**适用场景**: 在代码中集成、自动化流程

---

### 方式 3: 使用进化助手技能（最智能）

使用 `opencode/localevomap-skill/index.ts` 提供的智能助手：

```typescript
import evolutionAssistant from './opencode/localevomap-skill';

// 遇到错误时调用
const errorInfo = {
  message: 'TypeError: Cannot read property of undefined',
  logs: [{ error: 'TypeError: undefined is not a function' }],
  context: 'repair'
};

const result = await evolutionAssistant(errorInfo);

if (result?.type === 'capsule_found') {
  console.log('✅ Found solution:', result.capsule.summary);
  console.log('💡 Suggestion:', result.suggestion);
} else if (result?.type === 'gene_found') {
  console.log('🧬 Evolution strategy:', result.gene.strategy);
}
```

**适用场景**: 自动化错误处理、智能编码助手

## 📊 实际使用场景

### 场景 1: 遇到错误时自动搜索解决方案

**在 OpenCode 对话中**:

```
用户：我遇到了这个错误 "TypeError: Cannot read properties of undefined"

OpenCode: 让我搜索一下已有的解决方案...
[运行] evolutionAssistant({ message: 'TypeError: Cannot read properties of undefined' })
[结果] ✅ Found 3 matching capsules
[建议] 使用信心度最高的方案：添加 null 检查
```

**代码示例**:

```typescript
// 在错误处理中间件中使用
async function errorHandler(error) {
  const result = await evolutionAssistant({
    message: error.message,
    logs: [error]
  });
  
  if (result?.type === 'capsule_found') {
    // 自动应用解决方案
    return applyCapsule(result.capsule);
  }
  
  // 没有现成方案，手动处理
  return handleManually(error);
}
```

---

### 场景 2: 性能优化时搜索最佳实践

```typescript
// 性能优化前，搜索相关胶囊
const perfCapsules = await evomap.searchCapsules({
  signals: ['slow', 'performance', 'timeout'],
  minConfidence: 0.9
});

// 获取性能优化基因
const perfGenes = await evomap.getGenes({ category: 'performance' });

console.log('性能优化建议:', perfGenes.genes[0].strategy);
```

---

### 场景 3: 记录新的解决方案

当你解决了一个新问题，记录它供未来使用：

```typescript
// 解决问题后记录
await evomap.createCapsule({
  type: 'Capsule',
  schema_version: '1.0.0',
  id: `capsule_${Date.now()}`,
  trigger: ['TypeError', 'undefined'],
  gene: 'gene_repair_type_error',
  summary: 'Fixed by adding optional chaining (?.) and nullish coalescing (??)',
  confidence: 0.85,
  blast_radius: { files: 1, lines: 3 },
  outcome: { 
    status: 'success', 
    score: 0.9,
    duration_ms: 500
  },
  env_fingerprint: {
    platform: 'linux',
    node_version: 'v20.10.0',
    working_dir: '/home/user/project'
  }
});
```

---

### 场景 4: 在 CI/CD 中集成

```bash
# .github/workflows/test.yml
- name: Check for known issues
  run: |
    curl -X GET "http://10.104.11.12:3000/api/v1/capsules/search?signals=$ERROR_TYPE" \
      -H "Authorization: Bearer test-api-key" | jq .

- name: Record new fix
  if: success()
  run: |
    curl -X POST "http://10.104.11.12:3000/api/v1/capsules" \
      -H "Authorization: Bearer test-api-key" \
      -H "Content-Type: application/json" \
      -d '{"type":"Capsule","id":"capsule_'$(date +%s)'",...}'
```

## 🎮 在 OpenCode 中的交互示例

### 示例 1: 对话式使用

```
用户：帮我修复这个 TypeScript 错误

错误信息：
```
error TS2339: Property 'name' does not exist on type 'Object'.
```

OpenCode: 
让我先搜索一下类似的解决方案...

[后台调用]
const result = await evolutionAssistant({
  message: "TS2339: Property 'name' does not exist on type 'Object'",
  context: 'typescript'
});

找到了一个高信心度的解决方案：
- 问题类型：TypeScript 类型错误
- 建议：添加类型断言或使用类型守卫
- 信心度：87%

你想查看具体代码示例吗？
```

### 示例 2: 自动化工作流

```typescript
// scripts/auto-fix.ts
import evolutionWorkflow from './opencode/localevomap-skill';

// 监控错误日志
const errorLogs = collectErrorLogs();

for (const log of errorLogs) {
  const result = await evolutionWorkflow(log, {
    summary: 'Auto-applied fix from capsule',
    applied: true
  });
  
  if (result?.type === 'capsule_found') {
    console.log(`✅ Auto-fixed: ${log.message}`);
  }
}
```

## 🛠️ 配置和部署

### 本地开发环境

```typescript
// 修改配置
const EVOMAP_CONFIG = {
  baseUrl: 'http://localhost:3000',  // 本地开发
  apiKey: 'test-api-key',
  minConfidence: 0.7
};
```

### 生产环境

```typescript
// 使用远程服务器
const EVOMAP_CONFIG = {
  baseUrl: 'http://10.104.11.12:3000',  // 远程服务器
  apiKey: process.env.EVOMAP_API_KEY,
  minConfidence: 0.8  // 生产环境使用更高阈值
};
```

## 📈 最佳实践

### 1. 信心度阈值

- **开发环境**: 0.6 - 0.7（更宽松，更多建议）
- **生产环境**: 0.8 - 0.9（更严格，只推荐高信心方案）

### 2. 信号提取

```typescript
// 好的信号提取
const signals = ['TypeError', 'undefined', 'null'];  // ✅ 具体、可操作

// 不好的信号提取
const signals = ['error'];  // ❌ 太泛化
```

### 3. 胶囊记录

- **立即记录**: 解决问题后立即记录
- **详细摘要**: 清楚描述问题和解决方案
- **准确信心度**: 根据验证程度设置

### 4. 定期维护

```bash
# 查看事件历史
curl http://10.104.11.12:3000/api/v1/events?limit=50

# 清理低信心胶囊
curl -X DELETE http://10.104.11.12:3000/api/v1/capsules/capsule_low_confidence_123 \
  -H "Authorization: Bearer test-api-key"
```

## 🔍 故障排查

### 问题 1: API 连接失败

```bash
# 测试连接
curl http://10.104.11.12:3000/api/stats

# 检查服务器状态
ssh itops@10.104.11.12 "ps aux | grep 'node.*dist/server'"
```

### 问题 2: 认证失败

```typescript
// 确保认证头正确
headers: {
  'Authorization': 'Bearer test-api-key',  // 注意 Bearer 和空格
  'Content-Type': 'application/json'
}
```

### 问题 3: 找不到胶囊

```typescript
// 降低信心度阈值
const capsules = await evomap.searchCapsules({
  signals: ['error'],
  minConfidence: 0.5  // 降低阈值
});

// 或者扩大信号范围
const capsules = await evomap.searchCapsules({
  signals: ['error', 'TypeError', 'undefined', 'null'],
  minConfidence: 0.7
});
```

## 📚 参考资源

- **API 文档**: `docs/HTTP_API.md`
- **部署文档**: `docs/DEPLOYMENT_OPENCODE.md`
- **使用指南**: `HOW_TO_USE.md`
- **技能文档**: `opencode/localevomap-skill/README.md`

## 💡 快速开始

1. **测试连接**:
```bash
curl http://10.104.11.12:3000/api/stats
```

2. **搜索胶囊**:
```typescript
import { evomap } from './lib/evomap-client';
const capsules = await evomap.searchCapsules({ signals: ['error'] });
```

3. **记录方案**:
```typescript
await evomap.createCapsule({ /* ... */ });
```

4. **使用助手**:
```typescript
import evolutionAssistant from './opencode/localevomap-skill';
const result = await evolutionAssistant({ message: 'Your error here' });
```

---

**Happy Evolving! 🧬**
