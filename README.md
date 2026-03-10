# LocalEvomap - 本地能力进化系统

基于 EvoMap / evolver 思路构建的本地能力进化系统，用来让 AI Agent 在执行任务时：

- 先搜索已有 `Gene` / `Capsule`
- 在运行时通过 `MCP` 获取统一任务上下文
- 在任务结束后自主判断是否完成，并提交 retrospective
- 将验证过的经验沉淀回 LocalEvomap，影响后续 Agent

## 当前标准架构

LocalEvomap 当前采用 **MCP-first** 的标准接入方式：

- **MCP Server**：面向 Agent Runtime 的标准入口，提供 `start_task`、`record_usage`、`finalize_task` 等工具，以及 workspace 资源
- **Agent Skill**：负责任务完成判断、复盘组织、自主提交 retrospective
- **HTTP API**：主要用于 Dashboard、管理、运维和数据导入导出，不再作为标准 Agent Runtime 接口

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
3. 本地加载 `agent-skill/SKILL.md` 风格的任务编排说明
4. 任务开始时调用 `start_task`
5. 任务过程中通过 `record_usage` 记录实际生效的基因 / 胶囊 / 经验
6. Agent 自主判断任务是否完成；完成后调用 `finalize_task`
7. `finalize_task` 写入 retrospective、效果反馈，并在满足条件时触发 distill

## 项目结构

```text
├── agent-skill/             # Agent 侧任务编排说明（MCP-first）
├── core/                    # 核心逻辑：信号提取、选择、反馈、进化服务
├── data/                    # 本地数据目录
├── docs/                    # 设计、API、部署与接入文档
├── examples/                # Cursor / Claude Code / Codex / Kimi 配置模板
├── mcp/                     # MCP Server 实现与测试
├── public/                  # Dashboard 前端资源
├── storage/                 # Genes / Capsules / Events / Task Session 存储
├── types/                   # TypeScript 类型定义
├── server.ts                # HTTP API 入口
└── index.ts                 # LocalEvomap 主入口
```

## 文档入口

| 文档 | 说明 |
|------|------|
| `docs/SKILL_INSTALL.md` | MCP-first 接入说明与 agent-skill 使用方式 |
| `docs/MCP_CLIENT_CONFIG.md` | Cursor / Claude Code / Codex / Kimi / OpenCode 的可复制配置模板 |
| `docs/API_REFERENCE.md` | HTTP API 与 MCP 相关能力说明 |
| `docs/DEPLOYMENT.md` | 双环境部署流程 |
| `agent-skill/SKILL.md` | Agent 如何判断完成、何时提交 retrospective |
| `examples/.cursor/mcp.json` | Cursor MCP 示例 |
| `examples/.mcp.json` | Claude Code MCP 示例 |
| `examples/codex.config.toml` | Codex MCP 示例 |
| `examples/kimi.localevomap.json` | Kimi HTTP helper 配置模板 |
| `opencode/localevomap.remote.example.json` | OpenCode 远端配置模板 |

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
| `POST` | `/api/v1/genes` | 创建基因 |
| `GET` | `/api/v1/capsules/search` | 搜索胶囊 |
| `POST` | `/api/v1/capsules` | 创建胶囊 |
| `POST` | `/api/v1/evolve` | 执行一次进化 |
| `POST` | `/api/v1/feedback` | 提交 retrospective 反馈 |
| `GET` | `/api/v1/events` | 查看事件流 |
| `POST` | `/api/v1/distill/prepare` | 准备蒸馏 |
| `POST` | `/api/v1/distill/complete` | 完成蒸馏 |

更完整的字段与示例请查看 `docs/API_REFERENCE.md`。

## 开发说明

- 运行前请先配置 API Key / 环境变量
- 本仓库会生成截图、临时 JSON、DOM 抓取文件等调试产物，这些文件应保留为本地调试用途，不应进入版本库
- 对 Agent 行为的标准约束以 `agent-skill/SKILL.md` 和 `mcp/server.ts` 为准

## License

MIT
