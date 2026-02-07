# Hướng Dẫn Cài Đặt PM2 cho USDT Tracker

## Cài đặt PM2

```bash
npm install -g pm2
```

## Khởi động ứng dụng với PM2

```bash
# Khởi động ứng dụng
pm2 start ecosystem.config.js

# Hoặc chạy trực tiếp file JS
pm2 start telegram-tracker.js --name usdt-tracker
```

## Cấu hình PM2

File `ecosystem.config.js` chứa cấu hình cho PM2:

```javascript
module.exports = {
  apps: [{
    name: 'usdt-tracker',
    script: './telegram-tracker.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      CHECK_INTERVAL: 10000, // 10 giây kiểm tra một lần
      TRANSACTION_LIMIT: 10,
      TRONGRID_API_KEY: process.env.TRONGRID_API_KEY || '',
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
      TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || ''
    },
    error_file: './logs/usdt-tracker-error.log',
    out_file: './logs/usdt-tracker-out.log',
    log_file: './logs/usdt-tracker-combined.log',
    time: true
  }]
};
```

## Quản lý ứng dụng

```bash
# Xem trạng thái ứng dụng
pm2 status

# Xem log
pm2 logs usdt-tracker

# Restart ứng dụng
pm2 restart usdt-tracker

# Dừng ứng dụng
pm2 stop usdt-tracker

# Xem thông tin chi tiết
pm2 describe usdt-tracker
```

## Tự động khởi động cùng hệ thống

```bash
# Tạo startup script
pm2 startup

# Lưu cấu hình hiện tại để tự động chạy khi khởi động
pm2 save
```