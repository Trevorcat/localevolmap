#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-deploy@your-server.example.com}"
PUBLIC_HOST="${PUBLIC_HOST:-your-server.example.com}"
TEST_DIR="/home/itops/localevolmap-test"
PROD_DIR="/home/itops/localevolmap"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROD_ENV_FILE="${PROD_ENV_FILE:-$LOCAL_DIR/deployment/.env.prod}"

echo "=== 从测试服推进到正式服 ==="

echo "[1/4] 检查测试服状态..."
TEST_STATUS=$(ssh "$REMOTE_HOST" "bash $TEST_DIR/manage.sh status test 2>/dev/null" || echo "未运行")
echo "  测试服: $TEST_STATUS"

echo "[2/4] 复制代码..."
ssh "$REMOTE_HOST" "rm -rf $PROD_DIR/dist.bak && cp -r $PROD_DIR/dist $PROD_DIR/dist.bak 2>/dev/null || true"
ssh "$REMOTE_HOST" "cp -r $TEST_DIR/dist/* $PROD_DIR/dist/"
ssh "$REMOTE_HOST" "cp $TEST_DIR/package.json $PROD_DIR/package.json"
ssh "$REMOTE_HOST" "cp -r $TEST_DIR/node_modules $PROD_DIR/ 2>/dev/null || true"
ssh "$REMOTE_HOST" "cp -r $TEST_DIR/opencode $PROD_DIR/ 2>/dev/null || true"
ssh "$REMOTE_HOST" "cp $TEST_DIR/manage.sh $PROD_DIR/manage.sh && chmod +x $PROD_DIR/manage.sh"
echo "✓ 代码已复制"

echo "[3/4] 更新正式服配置..."
if [[ ! -f "$PROD_ENV_FILE" ]]; then
  echo "Missing prod env file. Copy deployment/.env.prod.example to deployment/.env.prod or set PROD_ENV_FILE."
  exit 1
fi
scp "$PROD_ENV_FILE" "${REMOTE_HOST}:$PROD_DIR/.env"
echo "✓ 配置已更新"

echo "[4/4] 重启正式服..."
ssh "$REMOTE_HOST" "cd $PROD_DIR && bash manage.sh restart prod"

echo ""
echo "=== 推进完成 ==="
echo "正式服地址: http://$PUBLIC_HOST:3000"
echo "查看日志: ssh $REMOTE_HOST 'tail -50 $PROD_DIR/server.log'"
echo ""
echo "注意: 正式服数据目录 ($PROD_DIR/data/) 未被覆盖"
echo "旧 dist 已备份至: $PROD_DIR/dist.bak/"