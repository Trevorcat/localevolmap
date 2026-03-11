#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# LocalEvomap Dual 环境管理脚本
# 单工程目录同时运行正式服(3000)和测试服(3001)
# =============================================================================
# 用法：
#   ./dual-manage.sh {start|stop|restart|status} {prod|test|all}
#
# 示例：
#   ./dual-manage.sh start prod      # 启动正式服
#   ./dual-manage.sh start test      # 启动测试服
#   ./dual-manage.sh start all       # 同时启动两个服务
#   ./dual-manage.sh stop all        # 停止所有服务
#   ./dual-manage.sh status all      # 查看所有服务状态
#   ./dual-manage.sh restart prod    # 重启正式服
# =============================================================================

ACTION="${1:-}"
ENV="${2:-}"

if [[ -z "$ACTION" || -z "$ENV" ]]; then
    echo "用法: $0 {start|stop|restart|status} {prod|test|all}"
    exit 1
fi

APP_DIR="/home/itops/localevolmap"

# 根据环境设置配置
get_env_config() {
    local env_type="$1"
    if [[ "$env_type" == "prod" ]]; then
        echo "${APP_DIR}/.env.prod"
    else
        echo "${APP_DIR}/.env.test"
    fi
}

get_pid_file() {
    local env_type="$1"
    echo "${APP_DIR}/server.${env_type}.pid"
}

get_log_file() {
    local env_type="$1"
    echo "${APP_DIR}/server.${env_type}.log"
}

get_label() {
    local env_type="$1"
    if [[ "$env_type" == "prod" ]]; then
        echo "[PROD-3000]"
    else
        echo "[TEST-3001]"
    fi
}

get_port() {
    local env_type="$1"
    if [[ "$env_type" == "prod" ]]; then
        echo "3000"
    else
        echo "3001"
    fi
}

# 加载 nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

get_pid() {
    local env_type="$1"
    local pid_file
    pid_file=$(get_pid_file "$env_type")
    
    if [[ -f "$pid_file" ]]; then
        local pid
        pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo "$pid"
            return 0
        fi
        # PID 文件存在但进程已死
        rm -f "$pid_file"
    fi
    echo ""
    return 1
}

do_start_single() {
    local env_type="$1"
    local label
    label=$(get_label "$env_type")
    local pid_file
    pid_file=$(get_pid_file "$env_type")
    local env_file
    env_file=$(get_env_config "$env_type")
    local log_file
    log_file=$(get_log_file "$env_type")
    local port
    port=$(get_port "$env_type")
    
    local pid
    pid=$(get_pid "$env_type" || true)
    if [[ -n "$pid" ]]; then
        echo "$label 服务已在运行 (PID: $pid)"
        return 0
    fi

    echo "$label 启动服务..."
    cd "$APP_DIR"
    
    # 使用对应的环境变量文件
    ENV_FILE="$env_file" nohup node dist/server.js >> "$log_file" 2>&1 &
    local new_pid=$!
    echo "$new_pid" > "$pid_file"
    
    # 等待启动
    sleep 2
    if kill -0 "$new_pid" 2>/dev/null; then
        echo "$label 服务已启动 (PID: $new_pid, 端口: $port)"
    else
        echo "$label 启动失败! 查看日志: tail -50 $log_file"
        rm -f "$pid_file"
        return 1
    fi
}

do_stop_single() {
    local env_type="$1"
    local label
    label=$(get_label "$env_type")
    local pid_file
    pid_file=$(get_pid_file "$env_type")
    
    local pid
    pid=$(get_pid "$env_type" || true)
    if [[ -z "$pid" ]]; then
        echo "$label 服务未运行"
        return 0
    fi

    echo "$label 停止服务 (PID: $pid)..."
    kill "$pid" 2>/dev/null || true
    
    # 等待进程退出
    local i=0
    while kill -0 "$pid" 2>/dev/null && [[ $i -lt 10 ]]; do
        sleep 1
        ((i++))
    done
    
    if kill -0 "$pid" 2>/dev/null; then
        echo "$label 强制终止..."
        kill -9 "$pid" 2>/dev/null || true
    fi
    
    rm -f "$pid_file"
    echo "$label 服务已停止"
}

do_status_single() {
    local env_type="$1"
    local label
    label=$(get_label "$env_type")
    local port
    port=$(get_port "$env_type")
    
    local pid
    pid=$(get_pid "$env_type" || true)
    if [[ -n "$pid" ]]; then
        echo "$label 🟢 运行中 (PID: $pid, 端口: $port)"
    else
        echo "$label ⚪ 未运行"
    fi
}

do_start() {
    if [[ "$ENV" == "all" ]]; then
        do_start_single "prod"
        do_start_single "test"
    else
        do_start_single "$ENV"
    fi
}

do_stop() {
    if [[ "$ENV" == "all" ]]; then
        do_stop_single "test"
        do_stop_single "prod"
    else
        do_stop_single "$ENV"
    fi
}

do_restart() {
    do_stop
    sleep 1
    do_start
}

do_status() {
    echo ""
    echo "╔════════════════════════════════════════╗"
    echo "║      LocalEvomap Dual 环境状态         ║"
    echo "╠════════════════════════════════════════╣"
    if [[ "$ENV" == "all" ]]; then
        do_status_single "prod"
        do_status_single "test"
    else
        do_status_single "$ENV"
    fi
    echo "╚════════════════════════════════════════╝"
    echo ""
}

case "$ACTION" in
    start)
        do_start
        ;;
    stop)
        do_stop
        ;;
    restart)
        do_restart
        ;;
    status)
        do_status
        ;;
    *)
        echo "未知操作: $ACTION"
        echo "用法: $0 {start|stop|restart|status} {prod|test|all}"
        exit 1
        ;;
esac
