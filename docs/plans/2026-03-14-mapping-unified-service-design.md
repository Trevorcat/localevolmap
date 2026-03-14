# Mapping Unified Service Design

**Date:** 2026-03-14

## Goal

将 `plugins/cloud_mapping` 整合进 `LocalEvomap`，使 Agent 在使用时只感知一个 `LocalEvomap` 服务，而不是两个独立系统。

## Context

- `LocalEvomap` 现在已经具备统一的 HTTP API 与 MCP Server。
- `cloud_mapping` 当前是 Python/FastAPI 实现，包含扫描、候选匹配、关系发现、LocalEvomap 辅助 rerank 与评估脚本。
- 业务目标不是把 mapping 变成 core domain，而是让它成为 `LocalEvomap` 的第一类 capability/plugin。
- 当前最重要的不是单语言，而是统一入口、统一鉴权、统一能力发现与统一健康状态。

## Design Decision

采用 **B 方案：保留 Python mapping 运行时，但由 LocalEvomap 统一对外暴露**。

即：
- Agent 只连接一个 `LocalEvomap MCP`
- Agent 只调用一个 `LocalEvomap HTTP API`
- `LocalEvomap` 内部通过插件框架启动并托管 `cloud_mapping` Python sidecar
- `cloud_mapping` 不再作为独立的对外系统存在，只是内部执行引擎

## Why This Approach

### 不选择纯 TypeScript 重写

纯 TS 重写虽然长期更统一，但当前成本高、风险大，会重复实现 `openpyxl`、扫描、匹配、E2E 脚本和已有评估逻辑。

### 选择 Python sidecar + unified facade

这种方式兼顾三点：
- 复用现有 `cloud_mapping` 代码资产
- 让 Agent 只感知同一个服务边界
- 为未来新增更多 capability/plugin 提供统一框架

## Service Boundary

对外只有一个服务：`LocalEvomap`。

### HTTP Boundary

统一暴露为：
- `GET /api/v1/mapping/health`
- `POST /api/v1/mapping/ingest/profiles`
- `POST /api/v1/mapping/query/candidates`

### MCP Boundary

统一暴露为：
- `mapping_get_status`
- `mapping_ingest_profiles`
- `mapping_query_candidates`

Agent 不需要知道 Python 插件端口或插件部署细节。

## Internal Architecture

### 1. Plugin Discovery

`LocalEvomap` 启动时扫描 `plugins/*/plugin.json`，发现所有可加载插件。

### 2. Config-Driven Enablement

主配置 `config/plugins.json` 控制：
- 是否启用插件
- 内部端口
- 启动超时
- 请求超时
- 数据目录
- 额外环境变量

### 3. Runtime Management

`plugin-manager` 负责：
- 构建插件清单
- 启动/停止插件
- 健康检查
- 维护插件状态：`discovered`、`disabled`、`starting`、`ready`、`degraded`、`failed`

### 4. Mapping Proxy Layer

Node/TypeScript 层新增 `mapping-proxy`：
- 将外部 HTTP/MCP 请求转发给本机 loopback 的 Python sidecar
- 统一处理超时、错误映射与响应格式
- 不泄露 Python 内部异常堆栈给 Agent

### 5. Python Sidecar

`plugins/cloud_mapping` 保持为 Python FastAPI 应用：
- 只监听 `127.0.0.1:<internal-port>`
- 只作为本机内部服务
- 数据库存放到主项目运行数据目录，而不是源码目录

## Responsibility Split

### LocalEvomap Core Owns

- 唯一对外服务边界
- HTTP/MCP 路由注册
- 鉴权
- runtime status
- plugin lifecycle
- 统一错误格式
- metrics / logs / health aggregation

### cloud_mapping Owns

- workbook / csv profiling
- table / column candidate ranking
- relation discovery
- mapping evaluation logic
- real scan / real E2E scripts

## Data Placement

源码与运行数据分离：

- 源码：`plugins/cloud_mapping`
- 运行数据：`data/plugins/cloud_mapping`

推荐运行数据：
- `data/plugins/cloud_mapping/mapping.db`
- `data/plugins/cloud_mapping/reports/`
- `data/plugins/cloud_mapping/cache/`

## Plugin Metadata Model

### `plugins/cloud_mapping/plugin.json`

声明：
- 插件 ID / version / displayName
- runtime kind = `python-sidecar`
- 启动命令
- 健康检查路径
- 可暴露的 HTTP / MCP capabilities

### `config/plugins.json`

声明：
- `enabled`
- `port`
- `startupTimeoutMs`
- `requestTimeoutMs`
- `dataDir`
- runtime env overrides

## Request Flows

### HTTP Flow

1. 客户端请求 `LocalEvomap` 的 `/api/v1/mapping/query/candidates`
2. `server.ts` 将请求交给 `mapping-proxy`
3. `mapping-proxy` 检查 `cloud_mapping` 插件是否 `ready`
4. 请求被转发到 `http://127.0.0.1:<internal-port>/api/v1/query/candidates`
5. Python sidecar 返回结果
6. Node 层写回统一响应格式

### MCP Flow

1. Agent 调用 `mapping_query_candidates`
2. `mcp/server.ts` 注册的 MCP 工具进入统一 service layer
3. service layer 调用 `LocalEvomap HTTP` 的 `/api/v1/mapping/query/candidates`
4. 返回 MCP structured content

## Error Model

### Plugin Disabled

- HTTP: `404 capability_not_enabled`
- MCP: tool not exposed or standardized capability-disabled result

### Plugin Unavailable

- HTTP: `503 plugin_unavailable`
- MCP: `PLUGIN_UNAVAILABLE`

### Plugin Timeout

- HTTP: `504 plugin_timeout`
- MCP: `PLUGIN_TIMEOUT`

### Plugin Upstream Error

- HTTP: `502 plugin_upstream_error`
- MCP: `PLUGIN_UPSTREAM_ERROR`

## Agent Experience

Agent 视角下：
- 只有一个 HTTP base URL
- 只有一个 MCP server
- bootstrap / runtime status 能看到 `mapping` 是 LocalEvomap 的 capability
- 不再感知独立的 mapping 服务地址

这就是“同一个服务”的关键实现方式。

## Deployment Model

生产部署时：
- 对外只开放 `LocalEvomap` 的服务端口
- 由 `LocalEvomap` 进程在本机启动 Python sidecar
- `cloud_mapping` 端口仅供 loopback 使用，不对外网开放

## Migration Strategy

### Phase 1

- 搭建插件元数据与配置
- 增加插件管理器
- 启动 Python sidecar
- 暴露统一 HTTP 路由
- 暴露统一 MCP 工具
- 将 runtime status 纳入 plugin 状态

### Phase 2

- 扩展扫描与评估的运维接口
- 增加 metrics / logs aggregation
- 支持更多插件类型

### Phase 3

- 如果 mapping 能力稳定，再评估是否迁移到 TS 实现

## Success Criteria

- Agent 只配置一个 LocalEvomap 服务即可使用 mapping 能力
- `/api/v1/mapping/*` 统一可用
- MCP 中存在 mapping 工具且可正常调用
- `cloud_mapping` 作为内部 sidecar 被成功托管
- `get_runtime_status` 能反映 mapping 插件状态
- 插件故障不会拖垮主服务
