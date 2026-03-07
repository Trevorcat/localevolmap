# LocalEvomap 部署指南

> **本文档面向 AI 编码助手。** 如果你是 AI agent（Claude Code、OpenCode、Codex 或其他），请按照以下流程帮助用户完成部署。

## 当前部署环境

| 项目 | 值 |
|------|------|
| 服务器 | `your-server.example.com`（用户 `itops`，SSH 免密登录） |
| Node.js | v20.20.0（通过 nvm 管理，**启动前必须 `source ~/.nvm/nvm.sh`**） |
| 进程管理 | nohup + PID 文件（**没有 PM2**） |
| 正式服 | `/home/itops/localevolmap`，端口 `3000` |
| 测试服 | `/home/itops/localevolmap-test`，端口 `3001` |
| LLM | Codex 5.3（`gpt-5.3-codex`，`https://your-llm-endpoint.example.com/v1`） |
| 构建 | 本地 Windows `npm run build` → scp 到服务器 |

## 核心原则：测试服先行

```
本地修改代码 → 本地构建 → 部署到测试服(3001) → 验证 → 推进到正式服(3000)
```

**绝对不要**直接在正式服上测试新功能。所有改动先在测试服验证通过。

## 目录结构

### 正式服 `/home/itops/localevolmap/`

```
├── dist/           # 编译后的 JS + public/
├── node_modules/   # 依赖
├── data/           # 正式数据（不可覆盖！）
│   ├── genes/
│   ├── capsules/
│   ├── events/
│   └── seed-genes.json
├── opencode/       # AI Skill 文件
├── .env            # 正式服配置（来自 deployment/.env.prod）
├── manage.sh       # 进程管理脚本
├── server.log      # 日志
├── server.pid      # PID 文件
└── package.json
```

### 测试服 `/home/itops/localevolmap-test/`

```
├── dist/           # 编译后的 JS + public/
├── node_modules/   # 依赖（从正式服复制）
├── data-test/      # 测试数据（隔离的）
│   ├── genes/
│   ├── capsules/
│   └── events/
├── data/
│   └── seed-genes.json  # seed 数据源
├── opencode/       # AI Skill 文件
├── .env            # 测试服配置（来自 deployment/.env.test）
├── manage.sh       # 进程管理脚本
├── server.log      # 日志
├── server.pid      # PID 文件
└── package.json
```

### 本地项目关键文件

```
deployment/
├── .env.test       # 测试服环境变量模板（端口 3001，data-test 路径）
├── .env.prod       # 正式服环境变量模板（端口 3000，data 路径）
└── ...

scripts/
├── manage.sh       # 进程管理：start/stop/restart/status test/prod
├── deploy-test.sh  # 构建 + 上传 + 重启测试服
├── deploy-prod.sh  # 构建 + 上传 + 重启正式服
└── promote.sh      # 测试服代码 → 正式服（不动数据）
```

## 开发流程

### 1. 修改代码（本地 Windows）

所有代码修改在本地 `E:\projects\test_model\capability\` 进行。

关键文件：
- `server.ts` — HTTP API 服务器
- `public/index.html` — Dashboard 单页面应用（无前端构建步骤）
- `core/` — 核心算法（LLM provider、evolution engine、signal extractor 等）
- `index.ts` — 主入口，`DEFAULT_CONFIG` 定义默认数据路径
- `types/gene-capsule-schema.ts` — TypeScript 类型定义

### 2. 本地构建

```bash
cd E:\projects\test_model\capability
npm run build
```

这会执行 `tsc` 编译 TypeScript → `dist/`，并复制 `public/` → `dist/public/`。

**构建必须零错误。** 如果有 TypeScript 错误，先修复再部署。

### 3. 部署到测试服

**方式 A：使用部署脚本（推荐）**

```bash
./scripts/deploy-test.sh
```

**方式 B：手动部署**

```bash
# 上传 dist
scp -r dist deploy@your-server.example.com:/home/itops/localevolmap-test/

# 上传配置
scp deployment/.env.test deploy@your-server.example.com:/home/itops/localevolmap-test/.env
scp scripts/manage.sh deploy@your-server.example.com:/home/itops/localevolmap-test/
scp package.json deploy@your-server.example.com:/home/itops/localevolmap-test/

# 上传其他需要的文件
scp -r opencode deploy@your-server.example.com:/home/itops/localevolmap-test/
scp data/seed-genes.json deploy@your-server.example.com:/home/itops/localevolmap-test/data/

# 确保 node_modules 存在
ssh deploy@your-server.example.com "test -d /home/itops/localevolmap-test/node_modules || cp -r /home/itops/localevolmap/node_modules /home/itops/localevolmap-test/"

# 重启
ssh deploy@your-server.example.com "chmod +x /home/itops/localevolmap-test/manage.sh && cd /home/itops/localevolmap-test && bash manage.sh restart test"
```

### 4. 在测试服验证

```bash
# 检查服务状态
ssh deploy@your-server.example.com "bash /home/itops/localevolmap-test/manage.sh status test"

# 测试 API
ssh deploy@your-server.example.com "curl -s http://localhost:3001/api/v1/genes?limit=1"

# 测试 Dashboard
# 浏览器打开 http://your-server.example.com:3001

# 初始化 seed（首次或数据清空后）
ssh deploy@your-server.example.com "curl -s -X POST http://localhost:3001/api/v1/seed -H 'Authorization: Bearer YOUR_API_KEY'"
```

### 5. 推进到正式服

验证通过后：

**方式 A：使用推进脚本（推荐）**

```bash
./scripts/promote.sh
```

这会：
1. 备份正式服 dist → dist.bak
2. 复制测试服 dist → 正式服 dist
3. 更新正式服 .env
4. 重启正式服

**方式 B：直接部署正式服**

```bash
./scripts/deploy-prod.sh
```

### 6. 验证正式服

```bash
ssh deploy@your-server.example.com "bash /home/itops/localevolmap/manage.sh status prod"
ssh deploy@your-server.example.com "curl -s http://localhost:3000/api/v1/genes?limit=1"
```

## 进程管理

`manage.sh` 是核心进程管理脚本，使用 PID 文件跟踪进程。

```bash
# 在服务器上执行
bash manage.sh start test     # 启动测试服
bash manage.sh stop test      # 停止测试服
bash manage.sh restart test   # 重启测试服
bash manage.sh status test    # 查看测试服状态

bash manage.sh start prod     # 启动正式服
bash manage.sh stop prod      # 停止正式服
bash manage.sh restart prod   # 重启正式服
bash manage.sh status prod    # 查看正式服状态
```

**注意：** `manage.sh` 内部会 `source ~/.nvm/nvm.sh` 加载 nvm。

### 端口被占用的处理

如果遇到 `EADDRINUSE`（端口被占用）：

```bash
# 查找占用进程
ssh deploy@your-server.example.com "ss -tlnp | grep 3000"

# 用 fuser 或 直接 kill
ssh deploy@your-server.example.com "fuser -k 3000/tcp"
# 或
ssh deploy@your-server.example.com "kill -9 <PID>"

# 然后重启
ssh deploy@your-server.example.com "cd /home/itops/localevolmap && bash manage.sh start prod"
```

## 环境变量

### 正式服 `.env`（`deployment/.env.prod`）

```bash
PORT=3000
GENES_PATH=./data/genes
CAPSULES_PATH=./data/capsules
EVENTS_PATH=./data/events
```

### 测试服 `.env`（`deployment/.env.test`）

```bash
PORT=3001
GENES_PATH=./data-test/genes
CAPSULES_PATH=./data-test/capsules
EVENTS_PATH=./data-test/events
```

### 关键环境变量说明

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 监听端口 | `3000` |
| `HOST` | 监听地址 | `0.0.0.0` |
| `EVOMAP_LLM_PROVIDER` | LLM 提供商 | 无（dry-run 模式） |
| `EVOMAP_LLM_MODEL` | LLM 模型名 | 无 |
| `LLM_API_KEY` | LLM API 密钥 | 无 |
| `LOCAL_LLM_BASE_URL` | LLM API 地址 | 无 |
| `GENES_PATH` | 基因存储路径 | `./data/genes` |
| `CAPSULES_PATH` | 胶囊存储路径 | `./data/capsules` |
| `EVENTS_PATH` | 事件日志路径 | `./data/events` |
| `HUB_API_KEY` | Dashboard API 认证密钥 | `YOUR_API_KEY` |
| `EVOMAP_REVIEW_MODE` | 高风险操作需审批 | `true` |

**GENES_PATH / CAPSULES_PATH / EVENTS_PATH** 是实现测试/正式数据隔离的关键。`server.ts` 中的 `getEvomap()` 会从环境变量读取这些路径，覆盖 `DEFAULT_CONFIG` 中的默认值。

## 数据管理

### 数据隔离原则

- **正式数据**（`/home/itops/localevolmap/data/`）：真实的基因、胶囊、进化事件。**任何部署操作都不应覆盖此目录。**
- **测试数据**（`/home/itops/localevolmap-test/data-test/`）：用于测试的数据。可以随时清空重来。

### 清空测试数据

```bash
ssh deploy@your-server.example.com "rm -rf /home/itops/localevolmap-test/data-test/genes/* /home/itops/localevolmap-test/data-test/capsules/* /home/itops/localevolmap-test/data-test/events/*"
ssh deploy@your-server.example.com "cd /home/itops/localevolmap-test && bash manage.sh restart test"
# 重新 seed
ssh deploy@your-server.example.com "curl -s -X POST http://localhost:3001/api/v1/seed -H 'Authorization: Bearer YOUR_API_KEY'"
```

### 备份正式数据

```bash
ssh deploy@your-server.example.com "cd /home/itops/localevolmap && tar czf data-backup-$(date +%Y%m%d).tar.gz data/"
```

## 故障排查

| 问题 | 检查 |
|------|------|
| 服务启动失败 | `tail -50 server.log` |
| 端口被占用 | `ss -tlnp \| grep 3000`（或 3001） |
| node 命令找不到 | `source ~/.nvm/nvm.sh` |
| 数据路径错误 | 检查 `.env` 中 `GENES_PATH` 等变量 |
| LLM 调用失败 | 检查 `.env` 中 LLM 配置，`tail server.log` 看错误 |
| Dashboard 显示异常 | 确认 `dist/public/index.html` 已更新 |
| 正式服数据丢失 | 检查 `.env` 中路径是否指向 `./data/`（不是 `./data-test/`） |

## 查看日志

```bash
# 正式服
ssh deploy@your-server.example.com "tail -100 /home/itops/localevolmap/server.log"

# 测试服
ssh deploy@your-server.example.com "tail -100 /home/itops/localevolmap-test/server.log"
```

## LLM 配置

当前使用 Codex 5.3 API（OpenAI-compatible 接口）：

```bash
EVOMAP_LLM_PROVIDER=local
EVOMAP_LLM_MODEL=gpt-5.3-codex
LLM_API_KEY=YOUR_LLM_API_KEY
LOCAL_LLM_BASE_URL=https://your-llm-endpoint.example.com/v1
```

**注意：** `core/llm-provider.ts` 中已实现：
- `stream: true` — Codex 5.3 要求必须开启流式
- `collectStreamResponse()` — SSE 流式响应收集
- `extractJson()` — 从 LLM 输出中提取 JSON（Codex 会在 JSON 前输出 markdown 文本）

如需更换 LLM，只需修改 `.env` 中的 4 个变量。
