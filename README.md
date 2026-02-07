# USDT Tracker

Ứng dụng theo dõi giao dịch USDT trên mạng lưới TRON.

## Tính năng

- Theo dõi các giao dịch USDT đến và đi từ địa chỉ ví được chỉ định
- Gửi thông báo qua Telegram khi có giao dịch mới
- Hiển thị số dư và biến động số dư theo thời gian thực
- Hỗ trợ nhiều địa chỉ ví cùng lúc
- Tự động phát hiện và thông báo các giao dịch lớn

## Cấu hình

Copy file `.env.example` thành `.env` và cập nhật các thông số cần thiết:

```bash
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_chat_id
MONITORED_ADDRESSES=address1,address2,address3
```

## Cài đặt

```bash
npm install
```

## Chạy ứng dụng

```bash
node telegram-tracker.js
```

## Chạy với PM2

```bash
pm2 start ecosystem.config.js
```