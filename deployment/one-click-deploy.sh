#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# LocalEvomap 一键部署脚本 (针对 10.104.11.15)
# =============================================================================
# 用法：
#   ./ONE_CLICK_DEPLOY.sh
#
# 这将自动在远程服务器上完成所有部署步骤
# =============================================================================

# 服务器配置
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_HOST="10.104.11.15"
APP_DIR="/opt/local-evomap"
PORT="${PORT:-3000}"
SERVICE_NAME="local-evomap"

echo "=========================================="
echo "LocalEvomap 一键部署"
echo "=========================================="
echo "远程服务器：${REMOTE_USER}@${REMOTE_HOST}"
echo "应用目录：${APP_DIR}"
echo "服务端口：${PORT}"
echo "=========================================="
echo ""

# 1. 克隆代码
echo "[1/6] 克隆代码到远程服务器..."
ssh ${REMOTE_USER}@${REMOTE_HOST} << 'SSH_EOF'
if [ -d "${APP_DIR}" ]; then
    echo "应用目录已存在，正在更新..."
    cd ${APP_DIR}
    git pull origin master
else
    echo "创建应用目录并克隆代码..."
    mkdir -p ${APP_DIR}
    cd ${APP_DIR}
    git clone https://github.com/Trevorcat/localevolmap.git .
fi
SSH_EOF

# 2. 安装依赖
echo "[2/6] 安装依赖..."
ssh ${REMOTE_USER}@${REMOTE_HOST} << SSH_EOF
cd ${APP_DIR}
echo "正在安装 npm 依赖..."
npm ci --prefer-offline --no-audit --timing
echo "正在构建项目..."
npm run build
SSH_EOF

# 3. 安装 PM2
echo "[3/6] 检查并安装 PM2..."
ssh ${REMOTE_USER}@${REMOTE_HOST} << SSH_EOF
if ! command -v pm2 >/dev/null 2>&1; then
    echo "安装 PM2..."
    npm install -g pm2
else
    echo "PM2 已安装，跳过..."
fi
SSH_EOF

# 4. 创建配置文件
echo "[4/6] 创建环境变量配置文件..."
ssh ${REMOTE_USER}@${REMOTE_HOST} << SSH_EOF
cd ${APP_DIR}
cat > .env.production << 'ENV_EOF'
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
CORS_ORIGINS=*

# LocalEvomap 安全边界
ALLOWED_COMMAND_PREFIXES=node,npm,npx
FORBIDDEN_PATHS=.git,node_modules
MAX_BLAST_FILES=50
MAX_BLAST_LINES=500

# 数据路径
GENES_PATH=/opt/local-evomap/data/genes
CAPSULES_PATH=/opt/local-evomap/data/capsules
EVENTS_PATH=/opt/local-evomap/data/events
ENV_EOF

# 创建数据目录
mkdir -p data/genes data/capsules data/events logs
echo "配置文件和数据目录创建完成"
SSH_EOF

# 5. 启动服务
echo "[5/6] 启动 PM2 服务..."
ssh ${REMOTE_USER}@${REMOTE_HOST} << SSH_EOF
cd ${APP_DIR}
echo "启动或重载服务..."
pm2 startOrReload deployment/ecosystem.config.cjs --env production
pm2 save
echo ""
echo "查看 PM2 状态:"
pm2 status
SSH_EOF

# 6. 配置开机自启
echo "[6/6] 配置 PM2 开机自启..."
ssh ${REMOTE_USER}@${REMOTE_HOST} << 'SSH_EOF'
echo "配置 PM2 开机自启（请检查输出并按提示操作）..."
pm2 startup
pm2 save
SSH_EOF

echo ""
echo "=========================================="
echo "✅ 部署完成！"
echo "=========================================="
echo ""
echo "服务信息:"
echo "  - Web UI: http://${REMOTE_HOST}:${PORT}"
echo "  - API: http://${REMOTE_HOST}:${PORT}/api/stats"
echo ""
echo "常用命令:"
echo "  # 查看服务状态"
echo "  ssh ${REMOTE_USER}@${REMOTE_HOST} 'pm2 status'"
echo ""
echo "  # 查看实时日志"
echo "  ssh ${REMOTE_USER}@${REMOTE_HOST} 'pm2 logs ${SERVICE_NAME}'"
echo ""
echo "  # 停止服务"
echo "  ssh ${REMOTE_USER}@${REMOTE_HOST} 'pm2 stop ${SERVICE_NAME}'"
echo ""
echo "  # 重启服务"
echo "  ssh ${REMOTE_USER}@${REMOTE_HOST} 'pm2 restart ${SERVICE_NAME}'"
echo ""
echo "  # 运行浏览器 E2E 测试"
echo "  ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${APP_DIR} && npx playwright test e2e/browser.spec.ts'"
echo ""
echo "=========================================="
