#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# LocalEvomap 双环境管理脚本 (PM2 版本)
# 同一工程目录通过 PM2 运行正式服(3000) + 测试服(3001)
# =============================================================================
# 用法：
#   ./scripts/manage.sh {start|stop|restart|status|logs} {prod|test|all}
#
# 示例：
#   ./scripts/manage.sh start all       # 一键启动双环境
#   ./scripts/manage.sh stop all        # 停止所有服务
#   ./scripts/manage.sh status all      # 查看所有服务状态
#   ./scripts/manage.sh restart prod    # 重启正式服
#   ./scripts/manage.sh logs test       # 查看测试服日志
# =============================================================================

ACTION="${1:-}"
ENV="${2:-}"

if [[ -z "$ACTION" || -z "$ENV" ]]; then
    echo "用法: $0 {start|stop|restart|status|logs} {prod|test|all}"
    exit 1
fi

APP_DIR="/home/itops/localevolmap"
PM2_BIN="$(npm root -g)/pm2/bin/pm2"

# 如果没有全局 pm2，尝试用 npx
if [[ ! -f "$PM2_BIN" ]]; then
    PM2_BIN="npx pm2"
fi

cd "$APP_DIR"

# 获取 PM2 进程名
get_pm2_name() {
    local env_type="$1"
    if [[ "$env_type" == "prod" ]]; then
        echo "localevomap-prod"
    else
        echo "localevomap-test"
    fi
}

# 获取标签
get_label() {
    local env_type="$1"
    if [[ "$env_type" == "prod" ]]; then
        echo "[PROD-3000]"
    else
        echo "[TEST-3001]"
    fi
}

# 获取端口
get_port() {
    local env_type="$1"
    if [[ "$env_type" == "prod" ]]; then
        echo "3000"
    else
        echo "3001"
    fi
}

# 检查 PM2 进程是否运行
is_running() {
    local env_type="$1"
    local pm2_name
    pm2_name=$(get_pm2_name "$env_type")
    
    $PM2_BIN describe "$pm2_name" 2>/dev/null | grep -q "online"
}

do_start_single() {
    local env_type="$1"
    local label
    label=$(get_label "$env_type")
    local pm2_name
    pm2_name=$(get_pm2_name "$env_type")
    local port
    port=$(get_port "$env_type")
    
    if is_running "$env_type"; then
        echo "$label 服务已在运行 (PM2: $pm2_name)"
        return 0
    fi

    echo "$label 启动服务 (PM2)..."
    
    # 使用 PM2 启动特定应用
    $PM2_BIN start config/ecosystem.config.js --only "$pm2_name"
    
    # 保存 PM2 配置
    $PM2_BIN save
    
    sleep 2
    
    if is_running "$env_type"; then
        echo "$label 服务已启动 (端口: $port)"
    else
        echo "$label 启动失败! 查看日志: $PM2_BIN logs $pm2_name"
        return 1
    fi
}

do_stop_single() {
    local env_type="$1"
    local label
    label=$(get_label "$env_type")
    local pm2_name
    pm2_name=$(get_pm2_name "$env_type")
    
    if ! is_running "$env_type"; then
        echo "$label 服务未运行"
        # 确保 PM2 中也删除
        $PM2_BIN delete "$pm2_name" 2>/dev/null || true
        return 0
    fi

    echo "$label 停止服务 (PM2: $pm2_name)..."
    $PM2_BIN stop "$pm2_name"
    $PM2_BIN delete "$pm2_name" 2>/dev/null || true
    
    echo "$label 服务已停止"
}

do_restart_single() {
    local env_type="$1"
    local label
    label=$(get_label "$env_type")
    local pm2_name
    pm2_name=$(get_pm2_name "$env_type")
    
    echo "$label 重启服务 (PM2: $pm2_name)..."
    
    if is_running "$env_type"; then
        $PM2_BIN restart "$pm2_name"
    else
        $PM2_BIN start config/ecosystem.config.js --only "$pm2_name"
    fi
    
    $PM2_BIN save
    echo "$label 服务已重启"
}

do_status_single() {
    local env_type="$1"
    local label
    label=$(get_label "$env_type")
    local pm2_name
    pm2_name=$(get_pm2_name "$env_type")
    local port
    port=$(get_port "$env_type")
    
    if is_running "$env_type"; then
        # 获取 PM2 的 PID
        local pid
        pid=$($PM2_BIN describe "$pm2_name" 2>/dev/null | grep "pid" | head -1 | awk '{print $2}')
        echo "$label 🟢 运行中 (PID: $pid, 端口: $port, PM2: $pm2_name)"
    else
        echo "$label ⚪ 未运行"
    fi
}

do_logs_single() {
    local env_type="$1"
    local pm2_name
    pm2_name=$(get_pm2_name "$env_type")
    
    echo "查看 $pm2_name 日志 (按 Ctrl+C 退出)..."
    $PM2_BIN logs "$pm2_name" --lines 50
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
    if [[ "$ENV" == "all" ]]; then
        do_restart_single "prod"
        do_restart_single "test"
    else
        do_restart_single "$ENV"
    fi
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
    echo "PM2 状态:"
    $PM2_BIN list 2>/dev/null || echo "  无 PM2 进程"
}

do_logs() {
    if [[ "$ENV" == "all" ]]; then
        echo "查看所有日志 (按 Ctrl+C 退出)..."
        $PM2_BIN logs --lines 50
    else
        do_logs_single "$ENV"
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
        do_restart
        ;;
    status)
        do_status
        ;;
    logs)
        do_logs
        ;;
    *)
        echo "未知操作: $ACTION"
        echo "用法: $0 {start|stop|restart|status|logs} {prod|test|all}"
        exit 1
        ;;
esac
