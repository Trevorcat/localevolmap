const path = require('path');

const appDir = process.env.APP_DIR || '/opt/local-evomap';

module.exports = {
  apps: [
    {
      name: process.env.SERVICE_NAME || 'local-evomap',
      cwd: process.cwd(),
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      out_file: path.join(appDir, 'logs', 'out.log'),
      error_file: path.join(appDir, 'logs', 'error.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'development',
        HOST: '0.0.0.0',
        PORT: 3000,
        CORS_ORIGINS: '*',
      },
      env_production: {
        NODE_ENV: 'production',
        HOST: process.env.HOST || '0.0.0.0',
        PORT: Number(process.env.PORT || 3000),
        CORS_ORIGINS: process.env.CORS_ORIGINS || '*',
      },
    },
  ],
};
