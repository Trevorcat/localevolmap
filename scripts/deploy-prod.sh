#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-deploy@your-server.example.com}"
PUBLIC_HOST="${PUBLIC_HOST:-your-server.example.com}"
REMOTE_DIR="/home/itops/localevolmap"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$LOCAL_DIR/scripts"
PROD_ENV_FILE="${PROD_ENV_FILE:-$LOCAL_DIR/deployment/.env.prod}"

echo "=== 部署 LocalEvomap 到正式服 ==="

echo "[1/4] 构建项目..."
cd "$LOCAL_DIR"
npm run build
echo "✓ 构建完成"

echo "[2/4] 准备远程目录..."
ssh "$REMOTE_HOST" "mkdir -p $REMOTE_DIR/dist $REMOTE_DIR/data/genes $REMOTE_DIR/data/capsules $REMOTE_DIR/data/events $REMOTE_DIR/data"

echo "[3/4] 上传文件..."
scp -r "$LOCAL_DIR/dist/"* "${REMOTE_HOST}:$REMOTE_DIR/dist/"
scp "$LOCAL_DIR/package.json" "${REMOTE_HOST}:$REMOTE_DIR/"
ssh "$REMOTE_HOST" "test -d $REMOTE_DIR/node_modules" || scp -r "$LOCAL_DIR/node_modules" "${REMOTE_HOST}:$REMOTE_DIR/"
if [[ ! -f "$PROD_ENV_FILE" ]]; then
  echo "Missing prod env file. Copy deployment/.env.prod.example to deployment/.env.prod or set PROD_ENV_FILE."
  exit 1
fi
scp "$PROD_ENV_FILE" "${REMOTE_HOST}:$REMOTE_DIR/.env"
scp "$LOCAL_DIR/data/seed-genes.json" "${REMOTE_HOST}:$REMOTE_DIR/data/" 2>/dev/null || true
scp -r "$LOCAL_DIR/opencode" "${REMOTE_HOST}:$REMOTE_DIR/" 2>/dev/null || true
scp "$SCRIPT_DIR/manage.sh" "${REMOTE_HOST}:$REMOTE_DIR/"
ssh "$REMOTE_HOST" "chmod +x $REMOTE_DIR/manage.sh"
echo "✓ 文件上传完成"

echo "[4/4] 重启正式服..."
ssh "$REMOTE_HOST" "cd $REMOTE_DIR && bash manage.sh restart prod"

echo ""
echo "=== 正式服部署完成 ==="
echo "地址: http://$PUBLIC_HOST:3000"
echo "查看日志: ssh $REMOTE_HOST 'tail -50 $REMOTE_DIR/server.log'"