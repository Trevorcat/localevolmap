#!/usr/bin/env bash
set -euo pipefail

# LocalEvomap 一键部署脚本（Ubuntu/Debian）
# 用法：
#   APP_DIR=/opt/local-evomap PORT=3000 CORS_ORIGINS="https://your-ui.com" ./deployment/deploy.sh

APP_DIR="${APP_DIR:-/opt/local-evomap}"
SERVICE_NAME="${SERVICE_NAME:-local-evomap}"
PORT="${PORT:-3000}"
NODE_ENV="${NODE_ENV:-production}"
ALLOWED_COMMAND_PREFIXES="${ALLOWED_COMMAND_PREFIXES:-node,npm,npx}"
FORBIDDEN_PATHS="${FORBIDDEN_PATHS:-.git,node_modules}"
MAX_FILES="${MAX_FILES:-50}"
MAX_LINES="${MAX_LINES:-500}"
CORS_ORIGINS="${CORS_ORIGINS:-*}"

LOG_DIR="${APP_DIR}/logs"
DATA_DIR="${APP_DIR}/data"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js 未安装，请先安装 Node.js 20+"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm 未安装"
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[INFO] 安装 PM2"
  npm install -g pm2
fi

echo "[INFO] 创建目录: ${APP_DIR}"
mkdir -p "${APP_DIR}" "${LOG_DIR}" "${DATA_DIR}" "${DATA_DIR}/genes" "${DATA_DIR}/capsules" "${DATA_DIR}/events"

echo "[INFO] 安装依赖"
npm ci

echo "[INFO] 构建项目"
npm run build

echo "[INFO] 写入环境变量文件 .env.production"
cat > "${APP_DIR}/.env.production" <<EOF
NODE_ENV=${NODE_ENV}
PORT=${PORT}
HOST=0.0.0.0
CORS_ORIGINS=${CORS_ORIGINS}

# LocalEvomap 安全边界
ALLOWED_COMMAND_PREFIXES=${ALLOWED_COMMAND_PREFIXES}
FORBIDDEN_PATHS=${FORBIDDEN_PATHS}
MAX_BLAST_FILES=${MAX_FILES}
MAX_BLAST_LINES=${MAX_LINES}

# 数据路径
GENES_PATH=${DATA_DIR}/genes
CAPSULES_PATH=${DATA_DIR}/capsules
EVENTS_PATH=${DATA_DIR}/events
EOF

echo "[INFO] 启动/重载 PM2 服务"
pm2 startOrReload deployment/ecosystem.config.cjs --env production
pm2 save

echo "[INFO] 配置 PM2 开机自启（若首次执行，请按输出提示完成）"
pm2 startup || true

echo "[OK] 部署完成"
echo "[INFO] 查看状态: pm2 status"
echo "[INFO] 查看日志: pm2 logs ${SERVICE_NAME}"
