#!/usr/bin/env bash
set -euo pipefail

# LocalEvomap 进程管理脚本 (PID-based, 无 PM2 依赖)
# 用法: ./scripts/manage.sh {start|stop|restart|status} {test|prod}

ACTION="${1:-}"
ENV="${2:-}"

if [[ -z "$ACTION" || -z "$ENV" ]]; then
    echo "用法: $0 {start|stop|restart|status} {test|prod}"
    exit 1
fi

# 根据环境设置路径
if [[ "$ENV" == "test" ]]; then
    APP_DIR="/home/itops/localevolmap-test"
    ENV_FILE="$APP_DIR/.env"
    LOG_FILE="$APP_DIR/server.log"
    PID_FILE="$APP_DIR/server.pid"
    LABEL="[TEST]"
elif [[ "$ENV" == "prod" ]]; then
    APP_DIR="/home/itops/localevolmap"
    ENV_FILE="$APP_DIR/.env"
    LOG_FILE="$APP_DIR/server.log"
    PID_FILE="$APP_DIR/server.pid"
    LABEL="[PROD]"
else
    echo "错误: 环境必须是 test 或 prod"
    exit 1
fi

# 加载 nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

get_pid() {
    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo "$pid"
            return 0
        fi
        # PID 文件存在但进程已死
        rm -f "$PID_FILE"
    fi
    echo ""
    return 1
}

do_start() {
    local pid
    pid=$(get_pid || true)
    if [[ -n "$pid" ]]; then
        echo "$LABEL 服务已在运行 (PID: $pid)"
        return 0
    fi

    echo "$LABEL 启动服务..."
    cd "$APP_DIR"
    nohup node dist/server.js >> "$LOG_FILE" 2>&1 &
    local new_pid=$!
    echo "$new_pid" > "$PID_FILE"
    
    # 等待启动
    sleep 2
    if kill -0 "$new_pid" 2>/dev/null; then
        echo "$LABEL 服务已启动 (PID: $new_pid)"
        # 读取端口
        local port
        port=$(grep -E "^PORT=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "unknown")
        echo "$LABEL 端口: $port"
    else
        echo "$LABEL 启动失败! 查看日志: tail -50 $LOG_FILE"
        rm -f "$PID_FILE"
        exit 1
    fi
}

do_stop() {
    local pid
    pid=$(get_pid || true)
    if [[ -z "$pid" ]]; then
        echo "$LABEL 服务未运行"
        return 0
    fi

    echo "$LABEL 停止服务 (PID: $pid)..."
    kill "$pid" 2>/dev/null || true
    
    # 等待进程退出
    local i=0
    while kill -0 "$pid" 2>/dev/null && [[ $i -lt 10 ]]; do
        sleep 1
        ((i++))
    done
    
    if kill -0 "$pid" 2>/dev/null; then
        echo "$LABEL 强制终止..."
        kill -9 "$pid" 2>/dev/null || true
    fi
    
    rm -f "$PID_FILE"
    echo "$LABEL 服务已停止"
}

do_status() {
    local pid
    pid=$(get_pid || true)
    if [[ -n "$pid" ]]; then
        local port
        port=$(grep -E "^PORT=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "unknown")
        echo "$LABEL 运行中 (PID: $pid, 端口: $port)"
    else
        echo "$LABEL 未运行"
    fi
}

case "$ACTION" in
    start)
        do_start
        ;;
    stop)
        do_stop
        ;;
    restart)
        do_stop
        sleep 1
        do_start
        ;;
    status)
        do_status
        ;;
    *)
        echo "未知操作: $ACTION"
        echo "用法: $0 {start|stop|restart|status} {test|prod}"
        exit 1
        ;;
esac
