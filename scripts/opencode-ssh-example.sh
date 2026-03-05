#!/usr/bin/env bash
set -euo pipefail

# OpenCode 示例：通过 SSH 查询远端服务状态

REMOTE_HOST="${REMOTE_HOST:?REMOTE_HOST is required}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
APP_DIR="${APP_DIR:-/opt/local-evomap}"

REMOTE_HOST="${REMOTE_HOST}" REMOTE_USER="${REMOTE_USER}" APP_DIR="${APP_DIR}" \
  bash scripts/opencode-remote-command.sh "pm2 status && bash deployment/health-check.sh"
