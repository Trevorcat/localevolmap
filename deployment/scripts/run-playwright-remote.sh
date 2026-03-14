#!/usr/bin/env bash
set -euo pipefail

# 在 OpenCode 客户端执行，通过 SSH 触发远程 Playwright 测试

REMOTE_HOST="${REMOTE_HOST:?REMOTE_HOST is required}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
APP_DIR="${APP_DIR:-/opt/local-evomap}"
REMOTE_PORT="${REMOTE_PORT:-22}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
PLAYWRIGHT_HEADLESS="${PLAYWRIGHT_HEADLESS:-true}"

ssh -p "${REMOTE_PORT}" "${REMOTE_USER}@${REMOTE_HOST}" \
  "set -euo pipefail; cd '${APP_DIR}'; npm run build; BASE_URL='${BASE_URL}' PLAYWRIGHT_HEADLESS='${PLAYWRIGHT_HEADLESS}' PW_REUSE_SERVER=true npm run test:e2e"

echo "[OK] 远程 Playwright 测试执行完成"
