#!/usr/bin/env bash
set -euo pipefail

# OpenCode 示例：运行浏览器自动化 smoke 测试

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
PLAYWRIGHT_HEADLESS="${PLAYWRIGHT_HEADLESS:-true}"

BASE_URL="${BASE_URL}" PLAYWRIGHT_HEADLESS="${PLAYWRIGHT_HEADLESS}" npm run test:e2e -- e2e/smoke.spec.ts
