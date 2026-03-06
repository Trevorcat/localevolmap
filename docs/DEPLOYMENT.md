# LocalEvomap 部署指南

> **本文档面向 AI 编码助手。** 如果你是 AI agent（Claude Code、OpenCode、Codex 或其他），请按照以下步骤帮助用户完成 LocalEvomap 服务器的部署。

## 你需要从用户那里获取的信息

在开始之前，确认以下信息（如果用户没有提供，主动询问）：

| 信息 | 示例 | 必需 |
|------|------|------|
| 目标服务器地址 | `user@192.168.1.100` | 是（远程部署时） |
| 部署目录 | `/opt/localevomap` | 是 |
| Node.js 版本 | v20+ | 是 |
| 端口 | `3000`（默认） | 否 |
| API Key | 自定义或使用默认 `test-api-key` | 否 |

## 部署流程

### Step 1: 克隆代码并安装依赖

```bash
git clone <repo-url> <部署目录>
cd <部署目录>
npm install
```

### Step 2: 构建

```bash
npm run build
# 或者
npx tsc
```

验证：`dist/server.js` 文件存在。

### Step 3: 启动服务器

**前台运行（调试用）：**
```bash
node dist/server.js
```

**后台运行（生产用）：**
```bash
nohup node dist/server.js >> server.log 2>&1 &
```

**使用环境变量自定义：**
```bash
PORT=3000 HOST=0.0.0.0 HUB_API_KEY=your-secret-key node dist/server.js
```

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `PORT` | `3000` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `HUB_API_KEY` | `test-api-key` | API 认证密钥 |
| `CORS_ORIGINS` | `*` | 允许的跨域来源（逗号分隔） |

### Step 4: 验证服务

```bash
curl -s http://localhost:3000/api/v1/genes
```

应返回包含 `total` 和 `genes` 字段的 JSON。

### Step 5: 初始化知识库

首次部署后预加载 10 个基础 Gene 策略：

```bash
curl -X POST http://localhost:3000/api/v1/seed \
  -H "Authorization: Bearer YOUR_API_KEY"
```

幂等操作，重复执行不会创建重复数据。

### Step 6: 安装 AI Skill（可选）

参见 [SKILL_INSTALL.md](./SKILL_INSTALL.md)。

## 远程服务器部署

如果部署到远程服务器，典型流程：

```bash
# 1. SSH 到服务器
ssh user@server

# 2. 确保 Node.js 可用
node --version  # 需要 v20+

# 3. 克隆、安装、构建
git clone <repo-url> /opt/localevomap
cd /opt/localevomap
npm install
npx tsc

# 4. 后台启动
nohup node dist/server.js >> server.log 2>&1 &

# 5. 验证
curl -s http://localhost:3000/api/v1/genes

# 6. 初始化 seed
curl -X POST http://localhost:3000/api/v1/seed -H "Authorization: Bearer YOUR_API_KEY"
```

### 使用 NVM 的服务器

如果服务器通过 NVM 管理 Node.js：

```bash
source ~/.nvm/nvm.sh && nvm use default
```

在 nohup 启动脚本中也需要加上这行，否则后台进程找不到 node。

### 进程管理

推荐用 PM2 管理进程（需要先安装 `npm install -g pm2`）：

```bash
pm2 start dist/server.js --name localevomap
pm2 save
pm2 startup  # 开机自启
```

如果不想装 PM2，用 systemd 或 nohup 也行。

## 更新部署

```bash
cd <部署目录>
git pull origin master
npx tsc
# 重启进程（根据你的进程管理方式）
pkill -f 'node dist/server' && nohup node dist/server.js >> server.log 2>&1 &
```

## 故障排查

| 问题 | 检查 |
|------|------|
| 端口被占用 | `lsof -i :3000` 或 `ss -tlnp \| grep 3000` |
| 进程不存在 | `ps aux \| grep 'node dist/server'` |
| 启动后立即退出 | `tail -50 server.log` 查看错误 |
| 远程无法访问 | 检查防火墙 `ufw status` 或 `iptables -L` |
| npm install 失败 | 确认 Node.js v20+ 和 npm v10+ |
