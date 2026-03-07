# LocalEvomap 快速部署指南

## 当前环境

- **服务器**: `deploy@your-server.example.com`（SSH 免密登录）
- **正式服**: `http://your-server.example.com:3000`，目录 `/home/itops/localevolmap`
- **测试服**: `http://your-server.example.com:3001`，目录 `/home/itops/localevolmap-test`
- **Node.js**: v20.20.0（nvm 管理）
- **进程管理**: nohup + PID 文件（无 PM2）

## 日常开发流程

```
修改代码 → npm run build → 部署测试服 → 验证 → 推进正式服
```

### Step 1: 修改代码 & 构建

```bash
cd E:\projects\test_model\capability
# 修改 server.ts / public/index.html / core/*.ts 等
npm run build    # 必须零错误
```

### Step 2: 部署到测试服

```bash
./scripts/deploy-test.sh
```

### Step 3: 验证测试服

```bash
# 浏览器打开 http://your-server.example.com:3001
# 或 API 测试
ssh deploy@your-server.example.com "curl -s http://localhost:3001/api/v1/genes?limit=1"
```

### Step 4: 推进到正式服

```bash
./scripts/promote.sh
```

### Step 5: 验证正式服

```bash
ssh deploy@your-server.example.com "curl -s http://localhost:3000/api/v1/genes?limit=1"
```

## 进程管理

```bash
# 在服务器上（ssh deploy@your-server.example.com 后执行）
bash /home/itops/localevolmap/manage.sh status prod       # 查看正式服
bash /home/itops/localevolmap/manage.sh restart prod      # 重启正式服
bash /home/itops/localevolmap-test/manage.sh status test  # 查看测试服
bash /home/itops/localevolmap-test/manage.sh restart test # 重启测试服
```

## 完整文档

详见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — 包含环境变量说明、数据管理、故障排查等。
