#!/usr/bin/env bash
set -euo pipefail

# 在 OpenCode 客户端机器上执行，生成并安装 SSH 公钥
# 用法：
#   REMOTE_USER=ubuntu REMOTE_HOST=10.0.0.8 ./deployment/setup-ssh-key.sh

REMOTE_USER="${REMOTE_USER:-ubuntu}"
REMOTE_HOST="${REMOTE_HOST:-127.0.0.1}"
REMOTE_PORT="${REMOTE_PORT:-22}"
KEY_PATH="${KEY_PATH:-$HOME/.ssh/id_ed25519}"

if [ ! -f "${KEY_PATH}" ]; then
  echo "[INFO] 生成 SSH 密钥: ${KEY_PATH}"
  ssh-keygen -t ed25519 -f "${KEY_PATH}" -N ""
fi

echo "[INFO] 安装公钥到远程服务器"
ssh-copy-id -i "${KEY_PATH}.pub" -p "${REMOTE_PORT}" "${REMOTE_USER}@${REMOTE_HOST}"

echo "[INFO] 验证免密登录"
ssh -p "${REMOTE_PORT}" "${REMOTE_USER}@${REMOTE_HOST}" "echo '[OK] SSH login success'"
