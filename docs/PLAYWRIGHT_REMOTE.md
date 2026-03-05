# Playwright 远程浏览器自动化

## 1. 推荐运行模式

- 无头模式：`PLAYWRIGHT_HEADLESS=true`（默认）
- 截图策略：`screenshot: 'on'`
- 输出目录：`test-results/playwright`

---

## 2. 本地执行（连接远程服务）

```bash
BASE_URL="http://<server-ip>:3000" PLAYWRIGHT_HEADLESS=true npm run test:e2e
```

---

## 3. 通过 SSH 在远程机执行

```bash
REMOTE_HOST=<server-ip> REMOTE_USER=ubuntu APP_DIR=/opt/local-evomap \
  BASE_URL="http://127.0.0.1:3000" PLAYWRIGHT_HEADLESS=true \
  bash scripts/run-playwright-remote.sh
```

---

## 4. 截图与报告路径

- 截图：`test-results/playwright/**`
- HTML 报告：`playwright-report/`

打开报告：

```bash
npx playwright show-report
```
