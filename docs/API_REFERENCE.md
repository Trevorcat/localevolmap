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

### `PUT /api/v1/capsules/:id`

更新胶囊（需认证）。

### `DELETE /api/v1/capsules/:id`

软删除胶囊（需认证）。

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
