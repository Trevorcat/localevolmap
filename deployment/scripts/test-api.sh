#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"

echo "[1/5] Reset"
curl -fsS -X POST "${BASE_URL}/api/reset" >/dev/null

echo "[2/5] Add gene"
curl -fsS -X POST "${BASE_URL}/api/gene" >/dev/null

echo "[3/5] Add capsule"
curl -fsS -X POST "${BASE_URL}/api/capsule" >/dev/null

echo "[4/5] Evolve"
curl -fsS -X POST "${BASE_URL}/api/evolve" >/dev/null

echo "[5/5] Stats"
curl -fsS "${BASE_URL}/api/stats"

echo "\n[OK] API smoke test passed"
