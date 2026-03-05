const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30000,
  use: {
    // Node.js 模式 - 不使用 browser
  },
  // 不配置 projects，使用默认 Node 环境
});
