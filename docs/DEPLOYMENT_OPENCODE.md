# LocalEvomap 服务器部署 + OpenCode 远程实验完整方案

本文覆盖：

1. 服务器部署（启动、PM2、日志、监控）
2. HTTP API 对外访问（CORS、测试）
3. SSH 远程执行（免密、命令入口）
4. Playwright 远程浏览器自动化
5. OpenCode 集成配置与验证
6. 故障排查与安全加固

---

## A. 前置要求

- 服务器系统：Ubuntu 22.04+（其他 Linux 可类比）
- Node.js 20+
- npm 10+
- 可用端口（默认 `3000`）
- 具备 sudo 权限（用于防火墙、SSH 配置）

---

## B. 一键部署（服务端）

### 1) 拉取代码并安装依赖

```bash
git clone <your-repo-url> /opt/local-evomap
cd /opt/local-evomap
npm ci
```

### 2) 设置可执行权限

```bash
chmod +x deployment/*.sh scripts/*.sh
```

### 3) 执行部署脚本

```bash
APP_DIR=/opt/local-evomap \
PORT=3000 \
CORS_ORIGINS="https://your-frontend.example.com,http://localhost:5173" \
bash deployment/deploy.sh
```

部署结果：

- 生成 `/opt/local-evomap/.env.production`
- 构建产物 `dist/`
- PM2 进程拉起 `local-evomap`
- 日志输出到 `/opt/local-evomap/logs/`

### 4) 防火墙

```bash
sudo APP_PORT=3000 SSH_PORT=22 bash deployment/setup-firewall.sh
```

---

## C. HTTP API 对外可访问配置

`server.ts` 已支持以下环境变量：

- `HOST`（默认 `0.0.0.0`）
- `PORT`（默认 `3000`）
- `CORS_ORIGINS`（逗号分隔来源）

示例：

```bash
HOST=0.0.0.0 PORT=3000 CORS_ORIGINS="https://app.example.com" npm start
```

接口文档见：`docs/HTTP_API.md`

API 测试：

```bash
BASE_URL="http://<server-ip>:3000" bash scripts/test-api.sh
```

---

## D. SSH 访问与 OpenCode 命令执行

### 1) 免密登录

在 OpenCode 运行端执行：

```bash
REMOTE_USER=ubuntu REMOTE_HOST=<server-ip> bash deployment/setup-ssh-key.sh
```

### 2) OpenCode 统一 SSH 命令入口

```bash
REMOTE_HOST=<server-ip> REMOTE_USER=ubuntu APP_DIR=/opt/local-evomap \
bash scripts/opencode-remote-command.sh "pm2 status"
```

更多说明见：`docs/SSH_OPENCODE.md`

---

## E. 浏览器自动化（Playwright）

远程服务 smoke 测试：

```bash
BASE_URL="http://<server-ip>:3000" PLAYWRIGHT_HEADLESS=true bash scripts/opencode-browser-example.sh
```

远程机执行 E2E：

```bash
REMOTE_HOST=<server-ip> REMOTE_USER=ubuntu APP_DIR=/opt/local-evomap \
BASE_URL="http://127.0.0.1:3000" PLAYWRIGHT_HEADLESS=true \
bash scripts/run-playwright-remote.sh
```

更多说明见：`docs/PLAYWRIGHT_REMOTE.md`

---

## F. OpenCode 集成配置

模板文件：`opencode/localevomap.remote.example.json`

建议复制为私有文件（不要提交敏感信息）：

```bash
cp opencode/localevomap.remote.example.json opencode/localevomap.remote.json
```

按实际环境修改：

- `server.baseUrl`
- `ssh.user/host/port/appDir`
- `playwright.baseUrl`

---

## G. OpenCode 三种交互方式示例

### 1) HTTP API

```bash
BASE_URL="http://<server-ip>:3000" bash scripts/opencode-http-example.sh
```

### 2) SSH 命令执行

```bash
REMOTE_HOST=<server-ip> REMOTE_USER=ubuntu APP_DIR=/opt/local-evomap \
bash scripts/opencode-ssh-example.sh
```

### 3) 浏览器自动化

```bash
BASE_URL="http://<server-ip>:3000" PLAYWRIGHT_HEADLESS=true bash scripts/opencode-browser-example.sh
```

---

## H. 一体化验证脚本

```bash
BASE_URL="http://<server-ip>:3000" \
REMOTE_HOST=<server-ip> REMOTE_USER=ubuntu APP_DIR=/opt/local-evomap \
bash scripts/verify-opencode-integration.sh
```

说明：

- 若不设置 `REMOTE_HOST`，脚本会跳过 SSH 验证

---

## I. 日志与监控

- PM2 状态：`pm2 status`
- 实时日志：`pm2 logs local-evomap`
- 健康检查：`bash deployment/health-check.sh`
- 日志轮转配置：`deployment/logrotate-local-evomap.conf`

安装 logrotate 规则：

```bash
sudo cp deployment/logrotate-local-evomap.conf /etc/logrotate.d/local-evomap
sudo logrotate -f /etc/logrotate.d/local-evomap
```

---

## J. 故障排查指南

### 1) API 无法访问

排查顺序：

1. `pm2 status` 是否在线
2. `ss -lntp | grep 3000` 是否监听在 `0.0.0.0:3000`
3. `ufw status` 是否放行端口
4. 反向代理/NAT 是否映射正确

### 2) CORS 报错

- 检查 `.env.production` 中 `CORS_ORIGINS`
- 多域名用逗号分隔
- 前端 `Origin` 必须与列表完全匹配

### 3) SSH 无法免密

- 确认客户端密钥权限：`chmod 600 ~/.ssh/id_ed25519`
- 检查服务端 `~/.ssh/authorized_keys`
- 查看 `/var/log/auth.log`

### 4) Playwright 失败

- 先跑 `npm run build`
- 检查 `BASE_URL`
- 查看 `playwright-report/` 和 `test-results/playwright/`

### 5) PM2 重启循环

- `pm2 logs local-evomap --lines 200`
- 检查 `dist/server.js` 是否存在
- 检查 `.env.production` 是否有非法值（如端口不是数字）

---

## K. 安全建议（强制）

1. 生产环境禁止 SSH 密码登录，仅公钥认证
2. 禁止 root 直接登录 SSH
3. `CORS_ORIGINS` 不要使用 `*`（除非仅内网测试）
4. OpenCode 配置中的真实 IP/用户名/密钥路径不要提交到仓库
5. 使用最小权限用户运行 PM2（避免 root）
6. 定期轮转日志和审计 `/api/*` 调用来源
