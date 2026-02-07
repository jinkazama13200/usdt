module.exports = {
  apps: [
    {
      name: 'usdt-tracker',
      script: './telegram-tracker.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_file: './.env',
      env: {
        NODE_ENV: 'production',
        CHECK_INTERVAL: 10000,
        TRANSACTION_LIMIT: 10
      },
      error_file: './logs/usdt-tracker-error.log',
      out_file: './logs/usdt-tracker-out.log',
      log_file: './logs/usdt-tracker-combined.log',
      time: true
    },
    {
      name: 'auto-message-scheduler',
      script: '../automessage/auto-message-scheduler.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
        TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || ''
      },
      error_file: './logs/auto-message-error.log',
      out_file: './logs/auto-message-out.log',
      log_file: './logs/auto-message-combined.log',
      time: true
    }
  ]
};