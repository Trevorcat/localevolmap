#!/usr/bin/env bash
set -euo pipefail

# OpenCode 示例：通过 HTTP API 触发一次进化流程

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"

curl -fsS -X POST "${BASE_URL}/api/reset" >/dev/null
curl -fsS -X POST "${BASE_URL}/api/gene" >/dev/null
curl -fsS -X POST "${BASE_URL}/api/capsule" >/dev/null
curl -fsS -X POST "${BASE_URL}/api/evolve"
