module.exports = {
  apps: [
    {
      name: 'localevomap-prod',
      script: './dist/server.js',
      cwd: '/home/itops/localevolmap',
      env: {
        NODE_ENV: 'production',
        ENV_FILE: '/home/itops/localevolmap/.env.prod'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      log_file: '/home/itops/localevolmap/server.prod.log',
      out_file: '/home/itops/localevolmap/server.prod.log',
      error_file: '/home/itops/localevolmap/server.prod.log',
      pid_file: '/home/itops/localevolmap/server.prod.pid',
      merge_logs: true,
      kill_timeout: 5000,
      listen_timeout: 10000,
      // 保活配置
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 3000
    },
    {
      name: 'localevomap-test',
      script: './dist/server.js',
      cwd: '/home/itops/localevolmap',
      env: {
        NODE_ENV: 'production',
        ENV_FILE: '/home/itops/localevolmap/.env.test'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      log_file: '/home/itops/localevolmap/server.test.log',
      out_file: '/home/itops/localevolmap/server.test.log',
      error_file: '/home/itops/localevolmap/server.test.log',
      pid_file: '/home/itops/localevolmap/server.test.pid',
      merge_logs: true,
      kill_timeout: 5000,
      listen_timeout: 10000,
      // 保活配置
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 3000
    }
  ]
};
