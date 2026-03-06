# Evolution API 设计文档

> 本文档定义 LocalEvoMap 进化相关 HTTP 接口的设计规范。
> 供实现者参照，所有接口遵循现有 `/api/v1/` 路由风格和认证机制。

---

## 1. 背景与问题

当前 `server.ts` 只实现了 Gene/Capsule/Event 的 **CRUD 接口**（Tier 2），但 README 文档中声称的核心进化操作：

- `evolve(logs)` — 执行进化循环
- `extractSignals(logs)` — 提取信号
- `selectGene(signals)` — 选择基因
- `selectCapsule(signals)` — 选择胶囊

**没有任何 HTTP 端点暴露这些能力。**

现有的 `POST /api/evolve` 是 legacy dashboard 的假端点（只改计数器），不调用 `EvolutionEngine`。

---

## 2. 消费者分析

主要消费者是 **AI Agent**（通过 OpenCode skill 调用）。Agent 的工作流：

```
遇到错误 → 搜索已有胶囊 → 没有则选基因获取策略 → Agent 自己修复 → 记录新胶囊
```

接口设计应围绕 **Agent 工作流编排**，而不是暴露内部实现细节。

---

## 3. 接口层次设计

```
┌─────────────────────────────────────────────────┐
│  Tier 1: 编排接口（Agent 主要使用）               │
│                                                 │
│  POST /api/v1/evolve          完整进化循环        │  ← 需实现
│  GET  /api/v1/capsules/search 搜索已有方案        │  ← 已实现
│  POST /api/v1/capsules        记录新方案          │  ← 已实现
│                                                 │
├─────────────────────────────────────────────────┤
│  Tier 2: 数据接口（CRUD，已全部实现）              │
│                                                 │
│  GET/POST/PUT/DELETE  /api/v1/genes             │  ← 已实现
│  GET/POST/PUT/DELETE  /api/v1/capsules          │  ← 已实现
│  GET                  /api/v1/events            │  ← 已实现
│                                                 │
├─────────────────────────────────────────────────┤
│  Tier 3: 调试接口（可选，开发/可视化用）            │
│                                                 │
│  POST /api/v1/signals/extract   信号提取         │  ← 需实现
│  POST /api/v1/genes/select      基因选择         │  ← 需实现
│  POST /api/v1/capsules/select   胶囊选择         │  ← 需实现
└─────────────────────────────────────────────────┘
```

**实现优先级：Tier 1 > Tier 3。** Tier 1 中只缺 `POST /api/v1/evolve`。

---

## 4. Tier 1: `POST /api/v1/evolve`

### 4.1 职责

接收原始日志，**串联完整 12 步进化循环**（信号提取 → 基因选择 → 胶囊匹配 → LLM 调用 → 验证 → 记录），返回 `EvolutionEvent`。

### 4.2 认证

**需要认证**（Bearer Token）。理由：有副作用——写 EvolutionEvent，可能创建新 Capsule。

### 4.3 请求

```
POST /api/v1/evolve
Authorization: Bearer <api-key>
Content-Type: application/json
```

```json
{
  "logs": [
    {
      "type": "tool_result",
      "error": {
        "code": "ERR_TYPE",
        "message": "TypeError: Cannot read properties of undefined (reading 'name')",
        "stack": "..."
      },
      "timestamp": "2026-03-06T10:00:00Z"
    }
  ],
  "dryRun": false,
  "strategy": "repair"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `logs` | `LogEntry[]` | ✅ | 原始运行时日志，格式参照 `signal-extractor.ts` 的 `LogEntry` 接口 |
| `dryRun` | `boolean` | ❌ | 覆盖全局 `EVOMAP_DRY_RUN`。`true` 时只生成方案不写磁盘 |
| `strategy` | `string` | ❌ | 覆盖全局 `strategy`。可选值: `balanced`, `innovate`, `harden`, `repair-only` |

### 4.4 成功响应

```
HTTP 200 OK
```

```json
{
  "event": {
    "id": "event_1772791234_1",
    "timestamp": "2026-03-06T10:00:05Z",
    "signals": ["log_error", "errsig:{...}", "error_type"],
    "selected_gene": "gene_gep_repair_from_errors",
    "used_capsule": null,
    "outcome": {
      "status": "success",
      "score": 0.9,
      "changes": {
        "files_modified": 1,
        "lines_added": 5,
        "lines_removed": 2
      }
    },
    "validation": {
      "passed": true,
      "commands_run": 2
    },
    "metadata": {
      "session_id": "local-dev",
      "iteration": 1,
      "blast_radius": {
        "files": 1,
        "lines": 5,
        "risk_level": "low"
      }
    }
  },
  "changes": [
    {
      "file": "src/index.ts",
      "operation": "modify",
      "content": "...",
      "reasoning": "Added null check to prevent TypeError"
    }
  ],
  "capsule_created": "capsule_1772791234"
}
```

响应体说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `event` | `EvolutionEvent` | 完整的进化事件记录（已持久化） |
| `changes` | `EvolutionChange[]` | LLM 生成的具体文件变更列表 |
| `capsule_created` | `string \| null` | 如果本次进化成功且无已有胶囊复用，返回新创建的胶囊 ID |

### 4.5 错误响应

**无匹配基因：**
```
HTTP 422 Unprocessable Entity
```
```json
{
  "error": "no_matching_gene",
  "message": "No matching genes found for signals: log_error, error_type",
  "signals": ["log_error", "error_type"]
}
```

**需要审批（高风险）：**
```
HTTP 403 Forbidden
```
```json
{
  "error": "approval_required",
  "message": "Approval required: high risk level",
  "blast_radius": { "files": 25, "lines": 300, "risk_level": "high" }
}
```

**LLM 调用失败：**
```
HTTP 502 Bad Gateway
```
```json
{
  "error": "llm_failed",
  "message": "LLM generation failed: Connection refused",
  "event_id": "event_error_1772791234"
}
```

**空日志：**
```
HTTP 400 Bad Request
```
```json
{
  "error": "invalid_input",
  "message": "logs array is required and must not be empty"
}
```

### 4.6 实现要点

1. **调用链**：`getEvomap()` → `evomap.evolve(logs)` — `EvolutionEngine.evolve()` 已实现完整 12 步
2. **dryRun 覆盖**：如果请求中传了 `dryRun`，需要临时覆盖 config（或传给引擎）
3. **strategy 覆盖**：同上，覆盖 `config.strategy`
4. **changes 返回**：`EvolutionEngine.evolve()` 当前只返回 `EvolutionEvent`，不返回 `changes`。需要从 `engine.getState().changes` 获取，或修改 `evolve()` 返回值
5. **capsule_created**：`evolve()` 内部第 12 步会创建胶囊，但不返回 ID。需要从引擎状态中提取或修改创建逻辑使其返回 ID
6. **错误分类**：`evolve()` 当前所有错误都 `throw Error`，需要按错误类型映射到不同 HTTP 状态码

### 4.7 超时策略

Qwen 27B 调用可能耗时 30-60 秒。

**当前阶段**：同步等待。设置合理的 HTTP 超时（建议 120 秒）。

**未来演进**（如果需要）：
```
POST /api/v1/evolve → 202 { "taskId": "evo_xxx" }
GET  /api/v1/evolve/:taskId → { "status": "running" | "completed" | "failed", "event": ... }
```

当前阶段不需要异步，同步足够。

---

## 5. Tier 3: 调试接口

这三个接口是 **只读** 的，不写任何状态，用于调试和可视化。优先级低于 `POST /api/v1/evolve`。

### 5.1 `POST /api/v1/signals/extract`

提取信号，不触发进化。

**认证**：不需要（只读操作）。

```
POST /api/v1/signals/extract
Content-Type: application/json
```

请求：
```json
{
  "logs": [
    {
      "type": "tool_result",
      "error": { "message": "TypeError: undefined is not a function" },
      "timestamp": "2026-03-06T10:00:00Z"
    }
  ]
}
```

响应：
```json
{
  "signals": ["log_error", "errsig:{...}", "error_type", "error_undefined"],
  "prioritySignals": ["log_error", "error_type", "error_undefined", "errsig:{...}"],
  "stats": {
    "total": 4,
    "errorCount": 4,
    "performanceCount": 0,
    "userRequestCount": 0
  }
}
```

**实现要点**：调用 `extractSignals({ logs })` + `analyzeSignals(signals)`。

---

### 5.2 `POST /api/v1/genes/select`

根据信号选择最佳基因。

**认证**：不需要。

```
POST /api/v1/genes/select
Content-Type: application/json
```

请求：
```json
{
  "signals": ["log_error", "error_type", "error_undefined"]
}
```

响应：
```json
{
  "selected": {
    "id": "gene_gep_repair_from_errors",
    "category": "repair",
    "strategy": ["从日志中提取结构化信号", "..."],
    "signals_match": ["error", "exception", "failed"]
  },
  "alternatives": [
    { "id": "gene_xxx", "category": "repair", "..." : "..." }
  ],
  "scoring": {
    "selected_score": 3,
    "all_scores": { "gene_gep_repair_from_errors": 3, "gene_xxx": 1 }
  }
}
```

**实现要点**：调用 `evomap.selectGene(signals)`。注意 `scoring.all_scores` 是 `Map`，需要序列化为普通对象。

---

### 5.3 `POST /api/v1/capsules/select`

根据信号选择最佳胶囊（带复用建议）。

**认证**：不需要。

**与现有 `GET /api/v1/capsules/search` 的区别**：
- `search` = 模糊过滤，返回列表
- `select` = 完整评分算法（信号匹配 + 环境指纹 + 成功率加权），返回最佳单个匹配 + 复用决策

```
POST /api/v1/capsules/select
Content-Type: application/json
```

请求：
```json
{
  "signals": ["log_error", "error_type", "error_undefined"]
}
```

响应（有匹配）：
```json
{
  "capsule": {
    "id": "capsule_1772790521565",
    "trigger": ["log_error", "error_type"],
    "summary": "Fixed by adding optional chaining",
    "confidence": 0.85,
    "outcome": { "status": "success", "score": 0.9 }
  },
  "reuse": {
    "shouldReuse": true,
    "reason": "All reuse criteria met",
    "confidence": 0.85
  }
}
```

响应（无匹配）：
```json
{
  "capsule": null,
  "reuse": null
}
```

**实现要点**：调用 `evomap.selectCapsule(signals)`，如果有结果再调用 `shouldReuseCapsule(capsule, signals)` 获取复用建议。

---

## 6. 需要配合修改的内部代码

以下是实现上述接口时，`EvolutionEngine` 需要的小幅调整：

| 问题 | 位置 | 建议 |
|---|---|---|
| `evolve()` 不返回 `changes` | `evolution-engine.ts` L120 | 修改返回类型为 `{ event: EvolutionEvent, changes: EvolutionChange[] }` 或提供 `getLastChanges()` 方法 |
| `evolve()` 不返回新创建的 capsule ID | `evolution-engine.ts` L438 | `createCapsuleFromSuccess` 返回 capsule ID，透传到 `evolve()` 返回值 |
| 错误没有分类 | `evolution-engine.ts` L191 | 区分 `NoMatchingGeneError`、`ApprovalRequiredError`、`LLMFailedError` 等，便于 server 映射 HTTP 状态码 |
| `dryRun` / `strategy` 无法按请求覆盖 | `evolution-engine.ts` | `evolve()` 接受可选的 per-request overrides 参数 |

---

## 7. Legacy 端点处理

现有的 `POST /api/evolve`（dashboard 假端点）应该：

- **保留**，但标记为 deprecated
- 不要复用这个路径，新端点使用 `/api/v1/evolve`
- 未来版本移除 legacy `/api/` 下的所有端点

---

## 8. 总结

| 端点 | 方法 | 优先级 | 认证 | 状态 |
|---|---|---|---|---|
| `/api/v1/evolve` | POST | **P0** | ✅ | ✅ 已实现 |
| `/api/v1/signals/extract` | POST | P2 | ❌ | ✅ 已实现 |
| `/api/v1/genes/select` | POST | P2 | ❌ | ✅ 已实现 |
| `/api/v1/capsules/select` | POST | P2 | ❌ | ✅ 已实现 |
