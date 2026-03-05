# LocalEvomap 使用指南

## 📋 目录

1. [快速开始](#快速开始)
2. [Web Dashboard 使用](#web-dashboard-使用)
3. [API 使用](#api-使用)
4. [OpenCode 集成](#opencode-集成)
5. [常见场景](#常见场景)

---

## 快速开始

### 服务器信息

- **地址**: `http://10.104.11.12:3000`
- **Dashboard**: `http://10.104.11.12:3000`
- **API Base**: `http://10.104.11.12:3000/api/v1`

### 访问 Dashboard

直接在浏览器打开：`http://10.104.11.12:3000`

你会看到 4 个页面：
- **Dashboard** - 概览统计
- **Genes** - 基因管理
- **Capsules** - 胶囊管理
- **Events** - 事件日志

---

## Web Dashboard 使用

### 1. 配置 API Key

在左侧导航栏底部，输入 API Key（默认：`test-api-key`），按 Enter 保存。

### 2. 管理基因 (Genes)

**查看基因列表**:
- 点击左侧导航 "Genes"
- 表格显示所有基因（按类别、信号匹配等）

**搜索基因**:
- 使用搜索框按 ID、描述、信号搜索

**创建基因**:
1. 点击 "Create Gene" 按钮
2. 填写表单：
   - `id`: 唯一标识符（如 `gene_repair_type_error`）
   - `category`: 选择类别（repair/optimize/feature/security/performance/refactor/test）
   - `signals_match`: 信号匹配（逗号分隔，如 `error,TypeError,undefined`）
   - `preconditions`: 前置条件（数组）
   - `strategy`: 执行策略（数组）
   - `constraints`: 约束条件（JSON 格式）
3. 点击 "Create"

**删除基因**:
- 点击基因行右侧的删除按钮
- 确认软删除（数据保留，标记为已删除）

### 3. 管理胶囊 (Capsules)

**查看胶囊列表**:
- 点击左侧导航 "Capsules"
- 表格显示所有胶囊（按状态、置信度等）

**搜索胶囊**:
- 按信号、基因、最小置信度过滤

**创建胶囊**:
1. 点击 "Create Capsule" 按钮
2. 填写表单：
   - `id`: 唯一标识符
   - `trigger`: 触发信号（数组）
   - `gene`: 关联的基因 ID
   - `summary`: 摘要描述
   - `confidence`: 置信度 (0-1)
   - `blast_radius`: 影响范围（JSON）
   - `outcome`: 执行结果（JSON）
3. 点击 "Create"

### 4. 查看事件 (Events)

- 点击左侧导航 "Events"
- 时间线样式显示所有进化事件
- 点击事件查看详情

---

## API 使用

### 认证

写操作需要 Bearer Token：
```bash
Authorization: Bearer test-api-key
```

### 基因 API

**列出基因**:
```bash
curl http://10.104.11.12:3000/api/v1/genes?q=error&category=repair&limit=10
```

**获取单个基因**:
```bash
curl http://10.104.11.12:3000/api/v1/genes/gene_repair_type_error
```

**创建基因**:
```bash
curl -X POST http://10.104.11.12:3000/api/v1/genes \
  -H "Authorization: Bearer test-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Gene",
    "id": "gene_my_gene",
    "category": "repair",
    "signals_match": ["error", "failed"],
    "preconditions": ["has error"],
    "strategy": ["Fix the error"],
    "constraints": {"max_files": 5, "max_lines": 50}
  }'
```

**软删除基因**:
```bash
curl -X DELETE http://10.104.11.12:3000/api/v1/genes/gene_my_gene \
  -H "Authorization: Bearer test-api-key"
```

### 胶囊 API

**搜索胶囊**:
```bash
curl "http://10.104.11.12:3000/api/v1/capsules/search?signals=error&minConfidence=0.8&limit=10"
```

**获取单个胶囊**:
```bash
curl http://10.104.11.12:3000/api/v1/capsules/capsule_my_capsule
```

**创建胶囊**:
```bash
curl -X POST http://10.104.11.12:3000/api/v1/capsules \
  -H "Authorization: Bearer test-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Capsule",
    "schema_version": "1.0.0",
    "id": "capsule_my_capsule",
    "trigger": ["error"],
    "gene": "gene_my_gene",
    "summary": "Fixed error",
    "confidence": 0.9,
    "blast_radius": {"files": 1, "lines": 10},
    "outcome": {"status": "success", "score": 0.9},
    "env_fingerprint": {"platform": "linux", "node_version": "v20"}
  }'
```

**软删除胶囊**:
```bash
curl -X DELETE http://10.104.11.12:3000/api/v1/capsules/capsule_my_capsule \
  -H "Authorization: Bearer test-api-key"
```

### 事件 API

**列出事件**:
```bash
curl "http://10.104.11.12:3000/api/v1/events?limit=20&offset=0"
```

**获取单个事件**:
```bash
curl http://10.104.11.12:3000/api/v1/events/event_123
```

---

## OpenCode 集成

### 配置文件

已创建：`opencode/localevomap.remote.json`

配置内容：
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

### 使用方式

#### 1. HTTP API 调用

在 OpenCode 中，使用配置的 `baseUrl` 发送 HTTP 请求：

```typescript
const baseUrl = 'http://10.104.11.12:3000';

// 获取基因列表
const genes = await fetch(`${baseUrl}/api/v1/genes`).then(r => r.json());

// 创建基因
await fetch(`${baseUrl}/api/v1/genes`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test-api-key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(geneData)
});
```

#### 2. SSH 远程命令

通过 SSH 在远程服务器执行命令：

```bash
ssh itops@10.104.11.12 "cd localevolmap && pm2 status"
```

#### 3. 浏览器自动化

使用 Playwright 测试远程 UI：

```bash
BASE_URL="http://10.104.11.12:3000" npx playwright test
```

---

## 常见场景

### 场景 1: 添加新的错误修复基因

**通过 Dashboard**:
1. 打开 `http://10.104.11.12:3000/#genes`
2. 点击 "Create Gene"
3. 填写表单并提交

**通过 API**:
```bash
curl -X POST http://10.104.11.12:3000/api/v1/genes \
  -H "Authorization: Bearer test-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Gene",
    "id": "gene_fix_null_pointer",
    "category": "repair",
    "signals_match": ["null", "undefined", "TypeError"],
    "preconditions": ["has null check"],
    "strategy": ["Add null check", "Fix the code"],
    "constraints": {"max_files": 3, "max_lines": 30}
  }'
```

### 场景 2: 搜索可用的胶囊

**通过 Dashboard**:
1. 打开 `http://10.104.11.12:3000/#capsules`
2. 在搜索框输入信号（如 `error`）
3. 设置最小置信度

**通过 API**:
```bash
curl "http://10.104.11.12:3000/api/v1/capsules/search?signals=TypeError&minConfidence=0.8"
```

### 场景 3: 查看最近的进化事件

**通过 Dashboard**:
- 打开 `http://10.104.11.12:3000/#events`
- 时间线显示所有事件

**通过 API**:
```bash
curl "http://10.104.11.12:3000/api/v1/events?limit=10"
```

### 场景 4: 清理不需要的基因

**通过 Dashboard**:
1. 打开 `http://10.104.11.12:3000/#genes`
2. 找到要删除的基因
3. 点击删除按钮
4. 确认软删除

**通过 API**:
```bash
curl -X DELETE http://10.104.11.12:3000/api/v1/genes/gene_old_gene \
  -H "Authorization: Bearer test-api-key"
```

---

## 服务器管理

### 查看日志

```bash
ssh itops@10.104.11.12 "cd localevolmap && tail -f server.log"
```

### 重启服务器

```bash
ssh itops@10.104.11.12 "cd localevolmap && pkill -f 'node.*dist/server.js' && . ~/.nvm/nvm.sh && node dist/server.js > server.log 2>&1 &"
```

### 查看进程

```bash
ssh itops@10.104.11.12 "ps aux | grep 'node.*dist/server' | grep -v grep"
```

---

## 故障排查

### Dashboard 无法访问

1. 检查服务器是否运行：
   ```bash
   ssh itops@10.104.11.12 "curl -s http://localhost:3000/api/stats"
   ```

2. 检查防火墙：
   ```bash
   ssh itops@10.104.11.12 "sudo ufw status | grep 3000"
   ```

### API 返回 401

- 检查 API Key 是否正确（默认 `test-api-key`）
- 确保 `Authorization` header 格式为 `Bearer <key>`

### 创建失败

- 检查 JSON 格式是否正确
- 检查必填字段是否齐全
- 查看服务器日志：`ssh itops@10.104.11.12 "tail -20 localevolmap/server.log"`

---

## 下一步

1. **配置 LLM**: 修改 `.env` 文件配置 LLM 提供者
2. **执行进化**: 通过 API 或 Dashboard 触发进化流程
3. **监控事件**: 定期查看 Events 页面了解系统活动

---

## 联系支持

如有问题，请查看：
- `docs/DEPLOYMENT_OPENCODE.md` - 完整部署文档
- `docs/HTTP_API.md` - API 详细文档
- `README.md` - 项目说明
