#!/usr/bin/env bash
set -euo pipefail

# LocalEvomap Skill Installer
# Supports: Claude Code, OpenCode, OpenAI Codex
#
# Usage:
#   curl -sL http://your-server.example.com:3000/install.sh | bash
#   curl -sL http://your-server.example.com:3000/install.sh | bash -s -- --client claude
#   curl -sL http://your-server.example.com:3000/install.sh | bash -s -- --client opencode
#   curl -sL http://your-server.example.com:3000/install.sh | bash -s -- --client codex
#   curl -sL http://your-server.example.com:3000/install.sh | bash -s -- --project   # install to current project only

SERVER="http://your-server.example.com:3000"
CLIENT=""
PROJECT_ONLY=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --client) CLIENT="$2"; shift 2 ;;
    --project) PROJECT_ONLY=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   LocalEvomap Skill Installer            ║${NC}"
echo -e "${BLUE}║   Server: ${SERVER}       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

# Detect installed clients if not specified
detect_clients() {
  local detected=()
  
  if command -v claude &>/dev/null || [ -d "$HOME/.claude" ]; then
    detected+=("claude")
  fi
  
  if command -v opencode &>/dev/null || [ -d "$HOME/.config/opencode" ]; then
    detected+=("opencode")
  fi
  
  if command -v codex &>/dev/null || [ -d "$HOME/.codex" ]; then
    detected+=("codex")
  fi
  
  echo "${detected[@]}"
}

install_claude() {
  echo -e "${YELLOW}[Claude Code]${NC} Installing..."
  
  if [ "$PROJECT_ONLY" = true ]; then
    mkdir -p .claude/commands
    curl -sL "${SERVER}/skill/claude" -o .claude/commands/evomap.md
    echo -e "${GREEN}  ✓${NC} Installed to .claude/commands/evomap.md"
    echo -e "     Use: ${BLUE}/evomap${NC} in Claude Code"
  else
    mkdir -p "$HOME/.claude/commands"
    curl -sL "${SERVER}/skill/claude" -o "$HOME/.claude/commands/evomap.md"
    echo -e "${GREEN}  ✓${NC} Installed to ~/.claude/commands/evomap.md"
    echo -e "     Use: ${BLUE}/evomap${NC} in Claude Code (global)"
  fi
}

install_opencode() {
  echo -e "${YELLOW}[OpenCode]${NC} Installing..."
  
  if [ "$PROJECT_ONLY" = true ]; then
    mkdir -p .opencode/commands
    curl -sL "${SERVER}/skill/opencode" -o .opencode/commands/evomap.md
    echo -e "${GREEN}  ✓${NC} Installed to .opencode/commands/evomap.md"
    echo -e "     Use: ${BLUE}/evomap${NC} in OpenCode"
  else
    mkdir -p "$HOME/.config/opencode/commands"
    curl -sL "${SERVER}/skill/opencode" -o "$HOME/.config/opencode/commands/evomap.md"
    echo -e "${GREEN}  ✓${NC} Installed to ~/.config/opencode/commands/evomap.md"
    echo -e "     Use: ${BLUE}/evomap${NC} in OpenCode (global)"
  fi
}

install_codex() {
  echo -e "${YELLOW}[Codex]${NC} Installing..."
  
  if [ "$PROJECT_ONLY" = true ]; then
    curl -sL "${SERVER}/skill/codex" -o AGENTS.md
    echo -e "${GREEN}  ✓${NC} Installed to ./AGENTS.md"
    echo -e "     Codex will auto-load on next session"
  else
    mkdir -p "$HOME/.codex"
    curl -sL "${SERVER}/skill/codex" -o "$HOME/.codex/AGENTS.md"
    echo -e "${GREEN}  ✓${NC} Installed to ~/.codex/AGENTS.md"
    echo -e "     Codex will auto-load on next session (global)"
  fi
}

# Main logic
if [ -n "$CLIENT" ]; then
  case "$CLIENT" in
    claude) install_claude ;;
    opencode) install_opencode ;;
    codex) install_codex ;;
    all) install_claude; install_opencode; install_codex ;;
    *) echo "Unknown client: $CLIENT (use: claude, opencode, codex, all)"; exit 1 ;;
  esac
else
  # Auto-detect and install for all detected clients
  DETECTED=$(detect_clients)
  
  if [ -z "$DETECTED" ]; then
    echo "No supported clients detected. Installing for all..."
    install_claude
    install_opencode
    install_codex
  else
    echo -e "Detected clients: ${GREEN}${DETECTED}${NC}"
    echo ""
    for client in $DETECTED; do
      case "$client" in
        claude) install_claude ;;
        opencode) install_opencode ;;
        codex) install_codex ;;
      esac
    done
  fi
fi

echo ""
echo -e "${GREEN}Done!${NC} LocalEvomap skill installed."
echo ""
echo "Quick test:"
echo -e "  curl -s ${SERVER}/api/v1/genes | head -c 200"
echo ""
echo -e "Dashboard: ${BLUE}${SERVER}${NC}"
echo ""
