# LocalEvomap - 本地能力进化系统

基于 EvoMap / evolver 思路构建的本地能力进化系统，用来让 AI Agent 在执行任务时：

- 先搜索已有 `Gene` / `Capsule`
- 在运行时通过 `MCP` 获取统一任务上下文
- 在任务结束后自主判断是否完成，并提交 retrospective
- 将验证过的经验沉淀回 LocalEvomap，影响后续 Agent

## 当前标准架构

LocalEvomap 当前采用 **MCP-first** 的标准接入方式：

- **MCP Server**: standard Agent Runtime entrypoint. Formal tools and workspace resources now write through the remote authoritative HTTP task plane.
- **Agent Skill**：负责任务完成判断、复盘组织、自主提交 retrospective
- **HTTP API**: serves dashboard, operations, version governance, the remote task/resource data plane used by MCP, and unified plugin capabilities such as mapping.

这意味着：Agent 不再依赖旧式 helper / CLI skill 流程，而是通过 MCP 与 LocalEvomap 交互。

## 核心概念

- **Genes（基因）**：策略模式，回答“看到哪些信号时，优先尝试什么方法”
- **Capsules（胶囊）**：已验证的解决方案，回答“这个问题上次是怎么修好的”
- **Signals（信号）**：从任务、错误、日志、用户反馈中提取的结构化特征
- **Task Session（任务会话）**：一次任务执行期间的上下文容器，用来记录选中的基因、使用过的胶囊和最终反馈

## 快速开始

```bash
npm install
npm run build
```

启动 HTTP 管理面：

```bash
node dist/server.js
```

启动 MCP 服务：

```bash
npm run mcp:start
```

Dashboard 默认可通过 `http://localhost:3000` 访问。

## 推荐接入流程

1. 启动 `HTTP API` 与 `MCP Server`
2. 在 Agent 客户端中接入 MCP 配置
3. 本地加载 `skill/SKILL.md` 风格的任务编排说明
4. 任务开始时调用 `start_task`
5. 任务过程中通过 `record_usage` 记录实际生效的基因 / 胶囊 / 经验
6. Agent 自主判断任务是否完成；完成后调用 `finalize_task`
7. `finalize_task` 写入 retrospective、效果反馈，并在满足条件时触发 distill

## Agent Bootstrap / 版本治理

现在 `local-evomap` MCP 在启动时会先向服务端做一次 bootstrap 检查：

- `GET /api/v1/agent-manifest`：获取服务端权威版本清单（MCP runtime + 各客户端 skill）
- `POST /api/v1/agent/check`：上报本地 runtime / skill 版本与 hash，判断是否 `ready`、`update_available` 或 `blocked`
- `get_runtime_status`：MCP 永远暴露的诊断工具，用来查看当前 bootstrap 状态与可用能力
- When bootstrap passes, `start_task`, `record_usage`, `get_task_context`, `finalize_task`, and workspace resources all use the remote service instead of local task-session files.

当前状态机：`booting`、`updating`、`ready`、`update_available`、`blocked`、`unreachable`、`update_failed`。

关键行为：

- 服务端不可达时，MCP 仍能启动，但会禁用正式能力；只保留 `get_runtime_status`
- `codex`、`claude-code`、`cursor` 支持按服务端 manifest 自动拉取并更新 skill
- `opencode`、`kimi` 当前只做版本提示，不自动改本地 skill
- 只有 `ready` / `update_available` 状态会暴露 `start_task`、`record_usage`、`finalize_task` 等正式工具与 workspace 资源

## Agent 一键安装（For AI Agents）

如果你是 AI Agent（Claude / Cursor / Codex / OpenCode 等），可以使用以下流程为用户自动配置 LocalEvomap：

### 极简安装流程

```
1. 询问用户 LocalEvomap 服务器地址
   （或从环境变量 LOCAL_EVOMAP_SERVER 读取）

2. 调用检测接口获取环境信息
   GET {serverUrl}/api/v1/install/detect
   → 返回：{ os, shell, detectedClients, preferredClient }

3. 调用计划接口获取安装计划
   POST {serverUrl}/api/v1/install/plan
   Body: { client: "auto", scope: "global", features: ["skill", "mcp"] }
   → 返回：{ success, detectedClient, detectedOS, plan }

4. 按 plan 执行安装：
   - 下载 skill 文件：GET {serverUrl}/skill/{client}
   - 写入到 plan.skill.targetPath
   - 配置 MCP：将 plan.mcp.config 写入 plan.mcp.targetPath

5. 验证安装
   - 检查文件是否存在
   - 测试服务器连接（plan.verification.steps）

6. 提示用户重启客户端
```

### API 端点速查

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/v1/install/detect` | GET | 检测 OS、Shell、已安装客户端 |
| `/api/v1/install/plan` | POST | 获取完整安装计划 |
| `/skill/{client}` | GET | 下载客户端 skill 文件 |
| `/skill` | GET | 获取 skill manifest |

### Plan 接口参数

```json
{
  "client": "claude|cursor|codex|opencode|auto",
  "scope": "global|project",
  "features": ["skill", "mcp"],
  "serverUrl": "http://your-server:3000"
}
```

### 客户端路径映射

| 客户端 | Skill 路径 | MCP 路径 |
|--------|-----------|----------|
| Claude | `~/.claude/commands/evomap.md` | `~/.claude/mcp.json` |
| Cursor | `~/.cursor/rules/localevomap.mdc` | `~/.cursor/mcp.json` |
| Codex | `~/.codex/AGENTS.md` | 不支持 |
| OpenCode | `~/.config/opencode/commands/evomap.md` | 不支持 |

### 用户提示语示例

> "我将为你安装 LocalEvomap。
> - Skill 文件 → {skillPath}
> - MCP 配置 → {mcpPath}
>
> 安装完成后需要重启客户端。确认安装？[Y/n]"

### 注意事项

- 所有配置均为纯算法生成，无需 LLM 参与
- MCP 配置内置服务器地址和 npm 包名（`@trevorcat/localevomap-mcp@latest`）
- API Key 可选，但推荐使用
- 安装前建议先调用 `/api/v1/install/detect` 确认环境

## 项目结构

```text
├── skill/                   # Agent Skill（MCP 工作流、安装脚本、类型定义）
├── core/                    # 核心逻辑与插件桥接层
├── data/                    # 本地数据目录（含插件运行数据）
├── docs/                    # 设计、API、部署与接入文档
├── docs/examples/           # Cursor / Claude Code / Codex / Kimi 配置模板
├── mcp/                     # MCP Server 实现与测试
├── plugins/                 # 内部 capability/plugin 源码（如 cloud_mapping）
├── public/                  # Dashboard 前端资源
├── storage/                 # Genes / Capsules / Events / Task Session 存储
├── types/                   # TypeScript 类型定义
├── server.ts                # LocalEvomap 统一 HTTP API 入口
└── index.ts                 # LocalEvomap 主入口
```

## 文档入口

| 文档 | 说明 |
|------|------|
| `docs/SKILL_INSTALL.md` | MCP-first 接入说明与 skill 使用方式 |
| `docs/MCP_CLIENT_CONFIG.md` | Cursor / Claude Code / Codex / Kimi / OpenCode 的可复制配置模板 |
| `docs/API_REFERENCE.md` | HTTP API 与 MCP 相关能力说明 |
| `docs/DEPLOYMENT.md` | 双环境部署流程 |
| `plugins.json` | 内部插件启用清单与运行配置 |
| `plugins/cloud_mapping/plugin.json` | mapping 插件清单 |
| `skill/SKILL.md` | Agent 如何判断完成、何时提交 retrospective |
| `docs/examples/.cursor/mcp.json` | Cursor MCP 示例 |
| `docs/examples/.mcp.json` | Claude Code MCP 示例 |
| `docs/examples/codex.config.toml` | Codex MCP 示例 |
| `docs/examples/kimi.localevomap.json` | Kimi HTTP helper 配置模板 |
| `docs/examples/localevomap.remote.example.json` | 远端配置模板（适用于 HTTP helper 客户端） |

## 支持的客户端形态

| 客户端 | 推荐方式 |
|--------|----------|
| Cursor | MCP + 本地 skill |
| Claude Code | MCP + 本地 skill |
| Codex | MCP + 本地 skill |
| Kimi | HTTP helper 配置模板 |
| OpenCode | HTTP helper / 部署模板；新运行时接入应优先 MCP |

## HTTP API 概览

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/v1/genes` | 列出基因 |
| `GET` | `/api/v1/agent-manifest` | 返回服务端权威的 runtime / skill manifest |
| `POST` | `/api/v1/agent/check` | 判断当前 agent runtime / skill 是否最新 |
| `GET` | `/api/v1/mapping/health` | 查询统一 mapping capability 状态 |
| `POST` | `/api/v1/mapping/ingest/profiles` | 通过统一服务写入 mapping profiles |
| `POST` | `/api/v1/mapping/query/candidates` | 通过统一服务查询 mapping 候选 |
| `POST` | `/api/v1/genes` | 创建基因 |
| `GET` | `/api/v1/capsules/search` | 搜索胶囊 |
| `POST` | `/api/v1/capsules` | 创建胶囊（已知时建议显式传 `gene`） |
| `POST` | `/api/v1/evolve` | 执行一次进化（纯算法模式） |
| `POST` | `/api/v1/feedback` | 提交 retrospective 反馈 |
| `GET` | `/api/v1/events` | 查看事件流 |
| `POST` | `/api/v1/distill/prepare` | 准备蒸馏（手动模式） |
| `POST` | `/api/v1/distill/complete` | 完成蒸馏（手动模式；自动蒸馏已由算法完成） |

更完整的字段与示例请查看 `docs/API_REFERENCE.md`。

补充说明：

- 直接调用 `POST /api/v1/capsules` 时，已知来源基因时应显式传 `gene`
- 若省略 `gene`，服务端会尝试根据 `trigger` 自动推断；只有无法匹配时才回落到 `unknown`
- 调用 `POST /api/v1/feedback` 时，若未显式传 `selected_gene`，服务端同样会根据 `signals` 尝试推断

## 开发说明

- 运行前请先配置 API Key / 环境变量
- 本仓库会生成截图、临时 JSON、DOM 抓取文件等调试产物，这些文件应保留为本地调试用途，不应进入版本库
- 对 Agent 行为的标准约束以 `skill/SKILL.md` 和 `mcp/server.ts` 为准
- To enable automatic skill updates and remote MCP writes, configure `LOCAL_EVOMAP_CLIENT`, `LOCAL_EVOMAP_SERVER_URL`, `LOCAL_EVOMAP_API_KEY`, and ideally `LOCAL_EVOMAP_SKILL_PATH` in the client MCP env.

## License

MIT
