# LocalEvomap 本地快速部署 + OpenCode 实验指南

## 🚀 5 分钟快速开始（本地测试）

### 1️⃣ 启动本地服务器

```bash
# 进入项目目录
cd E:\projects\test_model\capability

# 安装依赖（如果还没安装）
npm install

# 构建项目
npm run build

# 启动服务器（监听 localhost:3000）
npm start
```

服务器启动后，访问：http://localhost:3000

### 2️⃣ 测试 HTTP API

```bash
# 测试 API 是否正常工作
curl http://localhost:3000/api/stats
```

预期输出：
```json
{"genes":0,"capsules":0,"events":0}
```

### 3️⃣ 运行浏览器 E2E 测试

```bash
# 运行浏览器自动化测试
npx playwright test e2e/browser.spec.ts --headed
```

这将打开浏览器并自动执行测试！

### 4️⃣ 使用 OpenCode 进行实验

#### 方式 A: HTTP API 调用

创建文件 `scripts/opencode-http-example.sh`（已存在），或直接运行：

```bash
bash scripts/opencode-http-example.sh
```

这个脚本会：
1. 获取当前统计
2. 添加一个基因
3. 添加一个胶囊
4. 执行进化
5. 查看结果

#### 方式 B: 浏览器自动化

```bash
bash scripts/opencode-browser-example.sh
```

这将使用 Playwright 在浏览器中执行完整的 E2E 测试。

## 📋 完整的 OpenCode 实验示例

### 示例 1: 从 OpenCode 调用 API

在 OpenCode 中，你可以使用 bash 工具执行：

```bash
# 获取统计
curl http://localhost:3000/api/stats

# 添加基因
curl -X POST http://localhost:3000/api/gene

# 执行进化
curl -X POST http://localhost:3000/api/evolve

# 查看事件
curl http://localhost:3000/api/events
```

### 示例 2: 运行 Playwright 测试

```bash
# 运行单个测试
npx playwright test e2e/browser.spec.ts -g "should add genes"

# 运行所有 E2E 测试
npm run test:e2e:remote
```

### 示例 3: 查看实时状态

```bash
# 访问 Web UI
open http://localhost:3000  # macOS
start http://localhost:3000 # Windows
```

## 🔧 高级配置

### 修改端口

编辑 `deployment/.env.production.example` 或直接设置环境变量：

```bash
PORT=8080 npm start
```

### 允许跨域访问

```bash
CORS_ORIGINS="http://localhost:5173,https://your-domain.com" npm start
```

### 使用 PM2 保持服务运行

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start dist/server.js --name local-evomap

# 查看状态
pm2 status

# 查看日志
pm2 logs local-evomap

# 开机自启
pm2 startup
pm2 save
```

## 📊 监控和日志

### 实时日志

```bash
pm2 logs local-evomap --lines 50
```

### 健康检查

```bash
bash deployment/health-check.sh
```

## 🐛 故障排查

### 问题 1: 端口已被占用

```bash
# 查看谁占用了 3000 端口
netstat -ano | findstr :3000  # Windows
lsof -i :3000  # macOS/Linux

# 使用其他端口
PORT=3001 npm start
```

### 问题 2: 无法访问 API

1. 检查服务器是否启动：`pm2 status`
2. 检查防火墙设置
3. 检查 CORS 配置

### 问题 3: Playwright 测试失败

```bash
# 安装浏览器依赖
npx playwright install chromium

# 查看详细错误
npx playwright test e2e/browser.spec.ts --debug
```

## 📖 完整文档

- 部署文档：`docs/DEPLOYMENT_OPENCODE.md`
- API 文档：`docs/HTTP_API.md`
- SSH 配置：`docs/SSH_OPENCODE.md`
- Playwright 远程测试：`docs/PLAYWRIGHT_REMOTE.md`
