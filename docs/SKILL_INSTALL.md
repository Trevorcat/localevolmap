# LocalEvomap MCP / Skill 接入指南

> **本文档面向 AI 编码助手。** LocalEvomap 的标准 agent 接入方式已经切换为 **MCP + 本地 skill**，不再推荐 direct HTTP helper 模式。

## 接入目标

新的接入方式分成两层：

- **MCP server**: exposes `start_task`, `search_knowledge`, `record_usage`, `get_task_context`, and `finalize_task`, and now reads/writes the authoritative remote task plane through HTTP by default.
- **本地 skill**：要求 agent 在任务开始时建 session，在真正采用知识时记 usage，在最终交付前自行判断是否完成并调用 `finalize_task`

## 你需要从用户那里获取的信息

| 信息 | 示例 | 必需 |
|------|------|------|
| LocalEvomap MCP 命令 | `node /path/to/dist/mcp/server.js` | 是 |
| 使用的 AI 客户端 | Claude Code / OpenCode / Codex | 是 |
| 工作区路径 | `/path/to/workspace` | 是 |
| 安装范围 | 全局 / 仅当前项目 | 否（默认当前项目） |
| 操作系统 | Linux / macOS / Windows | 自动检测 |

以下所有说明中的 `MCP_COMMAND` 请替换为用户实际的 MCP 启动命令，例如 `node /path/to/dist/mcp/server.js`。

---

## 推荐方式

1. 在用户的 AI 客户端中注册 LocalEvomap MCP server。
2. 在工作区放置或加载 `agent-skill/SKILL.md` 对应的编排指令。
3. 确认 agent 会使用 `start_task`、`record_usage`、`finalize_task`。

可直接复制的客户端示例见 `docs/MCP_CLIENT_CONFIG.md`。

## MCP server

构建并启动：

```bash
npm install
npm run build
npm run mcp:start
```

默认命令：

```bash
node dist/mcp/server.js
```

## Skill 指令

将 `agent-skill/SKILL.md` 提供给 agent，并要求它：

- 开始任务时调用 `start_task`
- 真正采用知识时调用 `record_usage`
- 自己判断任务是否完成
- 完成时调用 `finalize_task`

## 验证点

确认 agent 侧具备以下能力：

- 能列出 MCP tools
- 能读取 `evomap://workspace/<workspace>/playbook`
- 完成任务时会自动调用 `finalize_task`

## 旧模式说明

以下旧路径不再是标准 agent 接入方式：

- direct HTTP helper
- task-end CLI feedback wrapper
- skill 内部手工拼接 feedback payload

---

## 新流程做了什么

安装后，AI 助手会在编码过程中：

1. **开始任务时** — 通过 `start_task` 打开 task session 并拿到首轮推荐
2. **真正采用知识时** — 通过 `record_usage` 记录哪个 `Gene` / `Capsule` 真的被使用了
3. **任务完成前** — agent 自己判断是否完成，并通过 `finalize_task` 提交 retrospective
4. **下一位 agent 开始时** — 通过 workspace resources 读取已验证的有效知识
