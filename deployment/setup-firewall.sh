#!/usr/bin/env bash
set -euo pipefail

# 基础防火墙设置（UFW）
# 用法：
#   APP_PORT=3000 SSH_PORT=22 ./deployment/setup-firewall.sh

APP_PORT="${APP_PORT:-3000}"
SSH_PORT="${SSH_PORT:-22}"

if ! command -v ufw >/dev/null 2>&1; then
  echo "[ERROR] 未检测到 ufw，请先安装后执行"
  exit 1
fi

echo "[INFO] 启用默认策略"
ufw default deny incoming
ufw default allow outgoing

echo "[INFO] 放行 SSH ${SSH_PORT}"
ufw allow "${SSH_PORT}/tcp"

echo "[INFO] 放行应用端口 ${APP_PORT}"
ufw allow "${APP_PORT}/tcp"

echo "[INFO] 启用 UFW"
ufw --force enable
ufw status verbose

echo "[OK] 防火墙规则已更新"
