#!/usr/bin/env bash
set -euo pipefail

# OpenCode 通过 SSH 调用的统一入口
# 示例：
#   REMOTE_HOST=10.0.0.8 REMOTE_USER=ubuntu APP_DIR=/opt/local-evomap \
#   bash scripts/opencode-remote-command.sh "pm2 status"

REMOTE_HOST="${REMOTE_HOST:?REMOTE_HOST is required}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
REMOTE_PORT="${REMOTE_PORT:-22}"
APP_DIR="${APP_DIR:-/opt/local-evomap}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env.production}"

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 \"<remote command>\""
  exit 1
fi

REMOTE_COMMAND="$*"

ssh -p "${REMOTE_PORT}" "${REMOTE_USER}@${REMOTE_HOST}" \
  "set -euo pipefail; export PATH=\$PATH:/usr/local/bin; cd '${APP_DIR}'; if [ -f '${ENV_FILE}' ]; then set -a; . '${ENV_FILE}'; set +a; fi; ${REMOTE_COMMAND}"
