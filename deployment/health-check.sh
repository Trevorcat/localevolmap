#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
SERVICE_NAME="${SERVICE_NAME:-local-evomap}"

echo "[INFO] PM2 状态"
pm2 status "${SERVICE_NAME}" || true

echo "[INFO] 检查 API: ${BASE_URL}/api/stats"
HTTP_CODE=$(curl -s -o /tmp/local-evomap-health.json -w "%{http_code}" "${BASE_URL}/api/stats")

if [ "${HTTP_CODE}" != "200" ]; then
  echo "[ERROR] 健康检查失败，HTTP ${HTTP_CODE}"
  exit 1
fi

echo "[OK] API 可用"
cat /tmp/local-evomap-health.json
