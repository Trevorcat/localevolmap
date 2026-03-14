# LocalEvomap 运维指南（Agent 专用）

本文件供 AI Agent 阅读，描述如何操作本项目。

## 项目概要

LocalEvomap 是一个 AI Agent 自进化系统，在同一工程目录下通过 PM2 同时运行正式服和测试服。

| 环境 | 端口 | 环境配置 | 数据目录 |
|------|------|----------|----------|
| prod | 3000 | `.env.prod` | `data/prod/` |
| test | 3001 | `.env.test` | `data/test/` |

## 服务管理

所有服务操作通过 `scripts/manage.sh` 完成，需要两个参数：`{动作} {环境}`。

```bash
# 一键启动双环境
./scripts/manage.sh start all

# 停止所有服务
./scripts/manage.sh stop all

# 重启正式服
./scripts/manage.sh restart prod

# 查看服务状态
./scripts/manage.sh status all

# 查看日志
./scripts/manage.sh logs test
```

动作：`start | stop | restart | status | logs`
环境：`prod | test | all`

## 拉取更新 & 重新构建

```bash
# 拉取最新代码
git pull origin master

# 构建项目
npm run build

# 重启服务使更新生效
./scripts/manage.sh restart all
```

如果依赖有变化：

```bash
git pull origin master
npm ci
npm run build
./scripts/manage.sh restart all
```

## 常用开发命令

| 命令 | 作用 |
|------|------|
| `npm run build` | 编译 TypeScript 到 `dist/` |
| `npm run dev` | 监听模式编译（开发用） |
| `npm test` | 运行单元测试 (Jest) |
| `npm run test:e2e` | 运行端到端测试 (Playwright) |
| `npm run test:api` | API 冒烟测试 |
| `npm run test:all` | 运行全部测试 |

## 项目结构

```
core/         核心模块（进化引擎、基因选择、信号提取等）
mcp/          MCP 服务端（Agent 通过 MCP 协议交互）
storage/      持久化层（基因、胶囊、事件存储）
types/        TypeScript 类型定义
config/       配置文件（agent-manifest、PM2 ecosystem）
scripts/      运维脚本（manage.sh、部署脚本等）
deployment/   远程部署相关（deploy.sh、health-check 等）
e2e/          端到端测试
docs/         所有文档
public/       Web UI 静态资源
lib/          客户端 SDK
```

入口文件：`index.ts`（库入口）、`server.ts`（HTTP 服务入口）

## 注意事项

- 修改代码后必须 `npm run build` 才能生效（服务运行的是 `dist/` 下的编译产物）
- 不要手动启动 `node dist/server.js`，统一使用 `scripts/manage.sh` 通过 PM2 管理
- `.env.prod` 和 `.env.test` 包含敏感配置，不要提交到 git
- `data/prod/` 和 `data/test/` 是运行时数据，不在版本管理中
