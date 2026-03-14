#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-deploy@your-server.example.com}"
PUBLIC_HOST="${PUBLIC_HOST:-your-server.example.com}"
REMOTE_DIR="/home/itops/localevolmap-test"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$LOCAL_DIR/scripts"
TEST_ENV_FILE="${TEST_ENV_FILE:-$LOCAL_DIR/deployment/.env.test}"

echo "=== 部署 LocalEvomap 到测试服 ==="

echo "[1/4] 构建项目..."
cd "$LOCAL_DIR"
npm run build
echo "✓ 构建完成"

echo "[2/4] 准备远程目录..."
ssh "$REMOTE_HOST" "mkdir -p $REMOTE_DIR/dist $REMOTE_DIR/data-test/genes $REMOTE_DIR/data-test/capsules $REMOTE_DIR/data-test/events $REMOTE_DIR/data"

echo "[3/4] 上传文件..."
scp -r "$LOCAL_DIR/dist/"* "${REMOTE_HOST}:$REMOTE_DIR/dist/"
scp "$LOCAL_DIR/package.json" "${REMOTE_HOST}:$REMOTE_DIR/"
ssh "$REMOTE_HOST" "test -d $REMOTE_DIR/node_modules" || scp -r "$LOCAL_DIR/node_modules" "${REMOTE_HOST}:$REMOTE_DIR/"
if [[ ! -f "$TEST_ENV_FILE" ]]; then
  echo "Missing test env file. Copy deployment/.env.test.example to deployment/.env.test or set TEST_ENV_FILE."
  exit 1
fi
scp "$TEST_ENV_FILE" "${REMOTE_HOST}:$REMOTE_DIR/.env"
scp "$LOCAL_DIR/data/seed-genes.json" "${REMOTE_HOST}:$REMOTE_DIR/data/" 2>/dev/null || true
scp -r "$LOCAL_DIR/opencode" "${REMOTE_HOST}:$REMOTE_DIR/" 2>/dev/null || true
scp "$SCRIPT_DIR/manage.sh" "${REMOTE_HOST}:$REMOTE_DIR/"
ssh "$REMOTE_HOST" "chmod +x $REMOTE_DIR/manage.sh"
echo "✓ 文件上传完成"

echo "[4/4] 重启测试服..."
ssh "$REMOTE_HOST" "cd $REMOTE_DIR && bash manage.sh restart test"

echo ""
echo "=== 测试服部署完成 ==="
echo "地址: http://$PUBLIC_HOST:3001"
echo "查看日志: ssh $REMOTE_HOST 'tail -50 $REMOTE_DIR/server.log'"