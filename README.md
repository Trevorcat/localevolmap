# LocalEvomap - 本地能力进化系统

基于 **EvoMap/evolver** 核心思想的本地进化知识系统。让 AI 编码助手在工作过程中自动搜索、复用已验证的解决方案，并将新方案录入共享知识库。

## 核心概念

- **Genes (基因)** — 抽象的知识模式，编码"如何响应特定信号"的策略
- **Capsules (胶囊)** — 具体、已验证的解决方案，可跨环境复用
- **Signals (信号)** — 从运行时日志中提取的结构化事件，驱动基因匹配和进化决策

## 快速开始

```bash
npm install
npm run build
node dist/server.js
```

服务启动后访问 `http://localhost:3000` 查看 Dashboard。

初始化知识库：

```bash
curl -X POST http://localhost:3000/api/v1/seed -H "Authorization: Bearer test-api-key"
```

## 项目结构

```
├── core/                    # 核心算法（基因选择、胶囊匹配、信号提取、进化引擎）
├── storage/                 # 持久化存储（基因、胶囊、事件日志）
├── types/                   # TypeScript 类型定义
├── public/                  # Dashboard 单页面应用
├── opencode/localevomap-skill/  # AI Skill 分发文件
├── data/                    # 数据存储目录
├── server.ts                # HTTP API 服务器
└── index.ts                 # LocalEvomap 主入口
```

## 文档

| 文档 | 说明 |
|------|------|
| [部署指南](./docs/DEPLOYMENT.md) | 服务器部署流程（给 AI 读，让 AI 帮你部署） |
| [AI Skill 安装](./docs/SKILL_INSTALL.md) | 为 Claude Code / OpenCode / Codex 安装 Skill（给 AI 读） |
| [API Reference](./docs/API_REFERENCE.md) | 完整的 HTTP API 文档和 Schema 说明 |
| [架构设计](./ARCHITECTURE.md) | 系统架构和设计决策 |
| [研究总结](./RESEARCH_SUMMARY.md) | EvoMap 原始论文研究笔记 |

## 支持的 AI 客户端

| 客户端 | Skill 格式 | 触发方式 |
|--------|-----------|----------|
| Claude Code | Slash Command | `/evomap` |
| OpenCode | Slash Command | `/evomap` |
| OpenAI Codex | AGENTS.md | 自动加载 |
| Cursor / Windsurf | AGENTS.md | 自动加载 |

一键安装（部署服务器后）：

```bash
# macOS / Linux
curl -sL http://YOUR_SERVER/install.sh | bash

# Windows PowerShell
irm http://YOUR_SERVER/install.ps1 | iex
```

详见 [AI Skill 安装指南](./docs/SKILL_INSTALL.md)。

## API 概览

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/v1/genes` | 列出基因 |
| `POST` | `/api/v1/genes` | 创建基因（最小字段: `category`, `signals_match`, `strategy`） |
| `GET` | `/api/v1/capsules` | 列出所有胶囊 |
| `GET` | `/api/v1/capsules/search` | 搜索胶囊 |
| `POST` | `/api/v1/capsules` | 创建胶囊（最小字段: `trigger`, `summary`） |
| `GET` | `/api/v1/capsules/:id/download` | 下载胶囊（需认证） |
| `POST` | `/api/v1/evolve` | 执行进化（需认证） |
| `POST` | `/api/v1/signals/extract` | 从日志提取信号 |
| `POST` | `/api/v1/genes/select` | 根据信号选择基因 |
| `POST` | `/api/v1/capsules/select` | 根据信号选择胶囊 |
| `GET` | `/api/v1/export` | 导出所有数据（需认证） |
| `POST` | `/api/v1/import` | 导入数据（需认证） |
| `GET` | `/api/v1/events` | 列出进化事件 |
| `POST` | `/api/v1/seed` | 预加载基础 Gene 策略（需认证） |

详见 [API Reference](./docs/API_REFERENCE.md)。

## 安全机制

- **API 认证** — Bearer Token 保护所有写操作
- **命令白名单** — 只允许安全命令前缀
- **路径限制** — 禁止访问 `.git`、`node_modules` 等
- **影响范围估算** — 限制修改文件数和行数
- **审批流程** — 高风险操作需人工确认

## License

MIT
