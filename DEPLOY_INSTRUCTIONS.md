# LocalEvomap 快速部署指南

## 🚀 一键部署（推荐）

### 前提条件
- ✅ SSH 免密登录已配置（10.104.11.15）
- ✅ 服务器有 root 或 sudo 权限
- ✅ 服务器已安装 Node.js 20+ 和 npm

### 部署步骤

**只需一条命令：**

```bash
cd E:\projects\test_model\capability
./ONE_CLICK_DEPLOY.sh
```

脚本会自动完成：
1. 克隆最新代码到服务器
2. 安装依赖并构建
3. 安装 PM2 进程管理器
4. 创建配置文件
5. 启动服务
6. 配置开机自启

### 验证部署

```bash
# 方式 1: 访问 Web UI
# 浏览器打开：http://10.104.11.15:3000

# 方式 2: 测试 API
curl http://10.104.11.15:3000/api/stats

# 方式 3: 查看服务状态
ssh root@10.104.11.15 'pm2 status'
```

## 📋 常用命令

### 查看服务状态
```bash
ssh root@10.104.11.15 'pm2 status'
```

### 查看实时日志
```bash
ssh root@10.104.11.15 'pm2 logs local-evomap'
```

### 重启服务
```bash
ssh root@10.104.11.15 'pm2 restart local-evomap'
```

### 停止服务
```bash
ssh root@10.104.11.15 'pm2 stop local-evomap'
```

### 更新代码
```bash
ssh root@10.104.11.15 'cd /opt/local-evomap && git pull && pm2 restart local-evomap'
```

### 运行 E2E 测试
```bash
ssh root@10.104.11.15 'cd /opt/local-evomap && npx playwright test e2e/browser.spec.ts'
```

## 🔧 修改配置

### 修改端口
编辑服务器上的配置文件：
```bash
ssh root@10.104.11.15 'nano /opt/local-evomap/.env.production'
# 修改 PORT=3000 为你想要的端口
# 然后重启服务
pm2 restart local-evomap
```

### 修改 CORS 设置
```bash
ssh root@10.104.11.15 'nano /opt/local-evomap/.env.production'
# 修改 CORS_ORIGINS 为允许的域名列表
# 例如：CORS_ORIGINS="http://your-frontend.com,http://localhost:5173"
```

## 🐛 故障排查

### 问题 1: 无法访问服务
```bash
# 检查服务是否运行
ssh root@10.104.11.15 'pm2 status'

# 检查端口是否监听
ssh root@10.104.11.15 'netstat -tlnp | grep 3000'

# 检查防火墙
ssh root@10.104.11.15 'ufw status'
# 如果防火墙开启，放行端口：
# sudo ufw allow 3000/tcp
```

### 问题 2: 服务崩溃
```bash
# 查看日志
ssh root@10.104.11.15 'pm2 logs local-evomap --lines 100'

# 重启服务
ssh root@10.104.11.15 'pm2 restart local-evomap'
```

### 问题 3: 代码更新失败
```bash
# 手动更新
ssh root@10.104.11.15 'cd /opt/local-evomap && git pull origin master && npm run build && pm2 restart local-evomap'
```

## 📊 监控

### 使用 PM2 监控
```bash
# 安装 PM2 监控
ssh root@10.104.11.15 'pm2 install pm2-logrotate'

# 查看监控面板
ssh root@10.104.11.15 'pm2 monit'
```

### 定期检查
```bash
# 添加定时任务检查服务
ssh root@10.104.11.15 'crontab -e'

# 添加以下内容（每小时检查一次）
0 * * * * cd /opt/local-evomap && /opt/local-evomap/deployment/health-check.sh >> /var/log/local-evomap-health.log 2>&1
```

## 🔒 安全建议

1. **修改默认端口**（如果可能）
2. **配置防火墙**只允许必要的 IP 访问
3. **禁用 root SSH 登录**，使用普通用户
4. **定期更新**系统包和依赖
5. **备份数据**目录（data/）

## 📖 完整文档

- [完整部署手册](docs/DEPLOYMENT_OPENCODE.md)
- [API 文档](docs/HTTP_API.md)
- [SSH 配置](docs/SSH_OPENCODE.md)
- [浏览器自动化](docs/PLAYWRIGHT_REMOTE.md)

## 🎯 下一步

1. **访问 Web UI**: http://10.104.11.15:3000
2. **测试 API**: `curl http://10.104.11.15:3000/api/stats`
3. **运行 E2E 测试**: `ssh root@10.104.11.15 'cd /opt/local-evomap && npx playwright test e2e/browser.spec.ts'`

---

**部署完成！享受 LocalEvomap！** 🎉
