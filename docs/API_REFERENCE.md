# LocalEvomap API Reference

## 认证

所有写操作需要 Bearer Token：

```
Authorization: Bearer YOUR_API_KEY
```

默认 API Key: `test-api-key`，可通过环境变量 `HUB_API_KEY` 修改。

---

## Gene API

### `GET /api/v1/genes`

列出所有基因。

| 参数 | 类型 | 说明 |
|------|------|------|
| `q` | string | 搜索 ID、描述、信号 |
| `category` | string | 按类别筛选 |
| `signal` | string | 按信号筛选 |
| `limit` | number | 每页数量（默认 100） |
| `offset` | number | 偏移量（默认 0） |

### `GET /api/v1/genes/:id`

获取单个基因。

### `POST /api/v1/genes`

创建基因（需认证）。

**最小字段**: `category`, `signals_match`（或 `signals`）, `strategy`

```json
{
  "category": "repair",
  "signals_match": ["TypeError", "null"],
  "strategy": ["Add null check", "Test"]
}
```

服务器自动填充: `id`, `type`, `preconditions`, `constraints`

| 字段 | 类型 | 必需 | 默认值 |
|------|------|------|--------|
| `category` | string | ✅ | `"repair"` |
| `signals_match` | string[] | ✅ | `[]` |
| `signals` | string[] | `signals_match` 的别名 | — |
| `strategy` | string[] | ✅ | `[]` |
| `id` | string | ❌ | 自动生成 |
| `preconditions` | string[] | ❌ | `[]` |
| `constraints` | object | ❌ | `{}` |

### `PUT /api/v1/genes/:id`

更新基因（需认证）。Body 为需要更新的字段。

### `DELETE /api/v1/genes/:id`

软删除基因（需认证）。

---

## Capsule API

### `GET /api/v1/capsules/search`

搜索胶囊。

| 参数 | 类型 | 说明 |
|------|------|------|
| `signals` | string | 信号（逗号分隔） |
| `gene` | string | 按关联基因筛选 |
| `minConfidence` | number | 最小置信度 |
| `limit` | number | 每页数量（默认 100） |
| `offset` | number | 偏移量（默认 0） |

### `GET /api/v1/capsules/:id`

获取单个胶囊。

### `POST /api/v1/capsules`

创建胶囊（需认证）。

**最小字段**: `trigger`, `summary`

```json
{
  "trigger": ["TypeError", "null"],
  "summary": "Fixed by adding optional chaining"
}
```

服务器自动填充: `id`, `type`, `schema_version`, `outcome`, `env_fingerprint`, `blast_radius`, `confidence`, `gene`, `metadata`

| 字段 | 类型 | 必需 | 默认值 |
|------|------|------|--------|
| `trigger` | string[] | ✅ | `[]` |
| `summary` | string | ✅ | `""` |
| `confidence` | number (0-1) | ❌ | `0.7` |
| `gene` | string | ❌ | `"unknown"` |
| `outcome` | object | ❌ | `{status:"success",score:0.7}` |
| `outcome.success` | boolean | 别名 | 转换为 `{status,score}` |
| `id` | string | ❌ | 自动生成 |

### `GET /api/v1/capsules`

列出所有胶囊（不含已删除）。

**响应**:
```json
{
  "total": 5,
  "capsules": [...]
}
```

### `GET /api/v1/capsules/:id/download`

下载胶囊为 JSON 文件（需认证）。

返回 `Content-Disposition: attachment` 头，文件名为 `capsule-{id}.json`。

### `PUT /api/v1/capsules/:id`

更新胶囊（需认证）。

### `DELETE /api/v1/capsules/:id`

软删除胶囊（需认证）。

---

## Evolution API（Tier 1 — 编排接口）

### `POST /api/v1/evolve`

执行完整 12 步进化循环（需认证）。接收日志，串联信号提取 → 基因选择 → 胶囊匹配 → LLM 调用 → 验证 → 记录，返回完整结果。

**请求**:
```json
{
  "logs": [
    {
      "type": "tool_result",
      "error": { "code": "ERR_TYPE", "message": "TypeError: Cannot read properties of undefined" },
      "timestamp": "2026-03-06T10:00:00Z"
    }
  ],
  "dryRun": false,
  "strategy": "repair"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `logs` | `LogEntry[]` | ✅ | 原始运行时日志（不能为空数组） |
| `dryRun` | `boolean` | ❌ | 覆盖全局 dry-run 设置。`true` 时只生成方案不写磁盘 |
| `strategy` | `string` | ❌ | 覆盖全局策略。可选值: `balanced`, `innovate`, `harden`, `repair-only` |

**成功响应** (200):
```json
{
  "event": {
    "id": "event_1772791234_1",
    "timestamp": "2026-03-06T10:00:05Z",
    "signals": ["log_error", "error_type"],
    "selected_gene": "gene_gep_repair_from_errors",
    "used_capsule": null,
    "outcome": { "status": "success", "score": 0.9, "changes": { "files_modified": 1, "lines_added": 5, "lines_removed": 2 } },
    "validation": { "passed": true, "commands_run": 2 },
    "metadata": { "session_id": "local-dev", "iteration": 1 }
  },
  "changes": [
    { "file": "src/index.ts", "operation": "modify", "content": "...", "reasoning": "Added null check" }
  ],
  "capsule_created": "capsule_1772791234"
}
```

**错误响应**:

| HTTP | error | 场景 |
|---|---|---|
| 400 | `invalid_input` | `logs` 缺失或为空数组 |
| 401 | `Authentication required` | 未提供认证 |
| 403 | `approval_required` | 高风险操作需审批 |
| 422 | `no_matching_gene` | 无匹配基因 |
| 502 | `llm_failed` | LLM 调用失败 |

---

## 调试接口（Tier 3 — 只读，无副作用）

### `POST /api/v1/signals/extract`

从日志中提取结构化信号（无需认证）。

**请求**:
```json
{
  "logs": [
    { "type": "tool_result", "error": { "message": "TypeError: undefined is not a function" }, "timestamp": "..." }
  ]
}
```

**响应**:
```json
{
  "signals": ["log_error", "error_type", "error_undefined"],
  "prioritySignals": ["log_error", "error_type", "error_undefined"],
  "stats": {
    "total": 3,
    "byCategory": { "error": 3 },
    "errorCount": 3,
    "performanceCount": 0,
    "userRequestCount": 0
  }
}
```

### `POST /api/v1/genes/select`

根据信号选择最佳基因（无需认证）。

**请求**:
```json
{
  "signals": ["log_error", "error_type", "error_undefined"]
}
```

**响应**:
```json
{
  "selected": { "id": "gene_gep_repair_from_errors", "category": "repair", "..." : "..." },
  "alternatives": [...],
  "scoring": {
    "selected_score": 3,
    "all_scores": { "gene_gep_repair_from_errors": 3, "gene_xxx": 1 }
  }
}
```

### `POST /api/v1/capsules/select`

根据信号选择最佳胶囊 + 复用建议（无需认证）。

与 `GET /api/v1/capsules/search` 的区别：`search` 是模糊过滤返回列表；`select` 使用完整评分算法（信号匹配 + 环境指纹 + 成功率加权）返回最佳单个匹配。

**请求**:
```json
{
  "signals": ["log_error", "error_type", "error_undefined"]
}
```

**有匹配响应**:
```json
{
  "capsule": {
    "id": "capsule_1772790521565",
    "trigger": ["log_error", "error_type"],
    "summary": "Fixed by adding optional chaining",
    "confidence": 0.85
  },
  "reuse": {
    "shouldReuse": true,
    "reason": "All reuse criteria met",
    "confidence": 0.85
  }
}
```

**无匹配响应**:
```json
{
  "capsule": null,
  "reuse": null
}

---

## Data Management API

### `GET /api/v1/export`

导出所有数据（需认证）。返回基因、胶囊、事件和配置。

**响应**:
```json
{
  "genes": [...],
  "capsules": [...],
  "events": [...],
  "config": { ... }
}
```

### `POST /api/v1/import`

导入数据（需认证）。支持导入基因和/或胶囊。

**请求**:
```json
{
  "genes": [...],
  "capsules": [...]
}
```

**响应**:
```json
{
  "message": "Import complete",
  "imported": { "genes": 3, "capsules": 2 }
}
```

---

## Event API

### `GET /api/v1/events`

列出进化事件。

| 参数 | 类型 | 说明 |
|------|------|------|
| `limit` | number | 每页数量（默认 50） |
| `offset` | number | 偏移量（默认 0） |

### `GET /api/v1/events/:id`

获取单个事件。

---

## Seed API

### `POST /api/v1/seed`

预加载基础 Gene 策略（需认证）。

包含 10 个基础 Gene，覆盖 repair、refactor、performance、feature、security、test 六个类别。幂等操作，已存在的不会重复创建。

---

## Skill 分发端点

这些端点无需认证：

| 路径 | Content-Type | 说明 |
|------|-------------|------|
| `/install.sh` | text/x-shellscript | Linux/macOS 一键安装脚本 |
| `/install.ps1` | text/plain | Windows PowerShell 安装脚本 |
| `/INSTALL.md` | text/markdown | 安装指南 |
| `/skill` | application/json | Skill 清单 |
| `/skill/claude` | text/markdown | Claude Code Skill 文件 |
| `/skill/opencode` | text/markdown | OpenCode Skill 文件 |
| `/skill/codex` | text/markdown | Codex AGENTS.md 文件 |
