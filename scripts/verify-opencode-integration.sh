#!/usr/bin/env bash
set -euo pipefail

echo "[1/3] Verify HTTP API mode"
bash scripts/opencode-http-example.sh >/dev/null

echo "[2/3] Verify SSH mode (optional)"
if [ -n "${REMOTE_HOST:-}" ]; then
  bash scripts/opencode-ssh-example.sh >/dev/null
else
  echo "[SKIP] REMOTE_HOST not set, skip SSH verification"
fi

echo "[3/3] Verify Browser automation mode"
bash scripts/opencode-browser-example.sh >/dev/null

echo "[OK] OpenCode integration verification completed"
