# OpenCode SSH 远程执行配置

## 1. 服务端安全基线

编辑 `/etc/ssh/sshd_config`（建议）：

```conf
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
AllowUsers ubuntu
```

修改后执行：

```bash
sudo systemctl restart sshd
```

---

## 2. 免密登录配置

在 OpenCode 运行端执行：

```bash
REMOTE_USER=ubuntu REMOTE_HOST=<server-ip> bash deployment/setup-ssh-key.sh
```

---

## 3. OpenCode 可复用命令入口

执行远程命令：

```bash
REMOTE_HOST=<server-ip> REMOTE_USER=ubuntu APP_DIR=/opt/local-evomap \
  bash scripts/opencode-remote-command.sh "pm2 status"
```

查看远程应用健康状态：

```bash
REMOTE_HOST=<server-ip> REMOTE_USER=ubuntu APP_DIR=/opt/local-evomap \
  bash scripts/opencode-remote-command.sh "bash deployment/health-check.sh"
```

---

## 4. 环境变量与 PATH

`scripts/opencode-remote-command.sh` 会在远端自动：

1. 进入 `APP_DIR`
2. 加载 `${APP_DIR}/.env.production`
3. 注入 `/usr/local/bin` 到 PATH

如需自定义 env 文件：

```bash
ENV_FILE=/opt/local-evomap/.env.staging REMOTE_HOST=<server-ip> \
  bash scripts/opencode-remote-command.sh "node -v"
```
