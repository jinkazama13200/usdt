const TronWeb = require('tronweb');
const { Telegraf } = require('telegraf');
const chalk = require('chalk');
require('dotenv').config();

// Hàm helper để thực hiện yêu cầu HTTP với xử lý cả JSON và HTML
async function makeApiRequest(url) {
  try {
    // Kiểm tra nếu fetch tồn tại
    if (typeof fetch === 'undefined') {
      throw new Error('fetch is not available in this environment');
    }
    
    const response = await fetch(url, {
      headers: {
        'TRONGRID-API-KEY': process.env.TRONGRID_API_KEY || ''
      }
    });
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      // Phản hồi JSON bình thường
      return {
        success: true,
        data: await response.json(),
        type: 'json'
      };
    } else if (contentType && contentType.includes('text/html')) {
      // Phản hồi HTML (thường là lỗi)
      const htmlContent = await response.text();
      return {
        success: false,
        data: htmlContent,
        type: 'html',
        statusCode: response.status
      };
    } else {
      // Không phải JSON hay HTML, thử đọc như văn bản thường
      const textContent = await response.text();
      try {
        // Thử parse như JSON nếu có thể
        const jsonData = JSON.parse(textContent);
        return {
          success: true,
          data: jsonData,
          type: 'json'
        };
      } catch {
        // Không phải JSON, coi như lỗi
        return {
          success: false,
          data: textContent,
          type: 'unknown',
          statusCode: response.status
        };
      }
    }
  } catch (error) {
    return {
      success: false,
      data: error.message,
      type: 'error',
      error: error
    };
  }
}

// Khởi tạo TronWeb với public provider (có thể không cần nếu chỉ dùng Tronscan API)
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY || '' },
});

// Hỗ trợ nhiều bot và nhiều chat ID
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Hỗ trợ nhiều bot và nhiều chat ID từ biến môi trường
const MULTI_BOT_TOKENS = process.env.MULTI_BOT_TOKENS ? process.env.MULTI_BOT_TOKENS.split(',') : [];
const MULTI_CHAT_IDS = process.env.MULTI_CHAT_IDS ? process.env.MULTI_CHAT_IDS.split(',') : [];

// Kết hợp tất cả bot và chat ID
let bots = [];

// Thêm bot từ TELEGRAM_BOT_TOKEN (tương thích ngược)
if (BOT_TOKEN) {
  bots.push({
    bot: new Telegraf(BOT_TOKEN),
    chatIds: CHAT_ID ? [CHAT_ID] : []
  });
}

// Thêm các bot từ MULTI_BOT_TOKENS
for (const token of MULTI_BOT_TOKENS) {
  if (token.trim()) {
    bots.push({
      bot: new Telegraf(token.trim()),
      chatIds: MULTI_CHAT_IDS.length > 0 ? MULTI_CHAT_IDS.map(id => id.trim()) : []
    });
  }
}

// Nếu không có bot nào được cấu hình
if (bots.length === 0) {
  console.log(chalk.yellow('⚠️  Cảnh báo: Không có bot Telegram nào được thiết lập. Thông báo Telegram sẽ bị tắt.'));
}

// Giữ lại biến bot và chatId để tương thích với các phần còn lại của code
// Nếu có ít nhất một bot, sử dụng bot đầu tiên cho các phần tương thích ngược
const bot = bots.length > 0 ? bots[0].bot : null;
const chatId = bots.length > 0 && bots[0].chatIds.length > 0 ? bots[0].chatIds[0] : null;

// Contract address của USDT trên mạng TRON
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// Base URL for TronGrid API - Nhanh hơn Tronscan
const TRONGRID_API_BASE = 'https://api.trongrid.io/v1';

class TelegramUSDTTracker {
  constructor() {
    this.monitoredAddresses = new Set();
    this.addressBalances = new Map();
    this.transactionHistory = new Map(); // Lưu trữ giao dịch đã thấy để tránh trùng lặp
    this.checkInterval = parseInt(process.env.CHECK_INTERVAL) || 10000;
    this.transactionLimit = parseInt(process.env.TRANSACTION_LIMIT) || 10;
    
    // Hỗ trợ nhiều bot và nhiều chat ID
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    // Hỗ trợ nhiều bot và nhiều chat ID từ biến môi trường
    const MULTI_BOT_TOKENS = process.env.MULTI_BOT_TOKENS ? process.env.MULTI_BOT_TOKENS.split(',') : [];
    const MULTI_CHAT_IDS = process.env.MULTI_CHAT_IDS ? process.env.MULTI_CHAT_IDS.split(',') : [];

    // Kết hợp tất cả bot và chat ID
    this.bots = [];

    // Thêm bot từ TELEGRAM_BOT_TOKEN (tương thích ngược)
    if (BOT_TOKEN) {
      this.bots.push({
        bot: new Telegraf(BOT_TOKEN),
        chatIds: CHAT_ID ? [CHAT_ID] : []
      });
    }

    // Thêm các bot từ MULTI_BOT_TOKENS
    for (const token of MULTI_BOT_TOKENS) {
      if (token.trim()) {
        this.bots.push({
          bot: new Telegraf(token.trim()),
          chatIds: MULTI_CHAT_IDS.length > 0 ? MULTI_CHAT_IDS.map(id => id.trim()) : []
        });
      }
    }

    // Nếu không có bot nào được cấu hình
    if (this.bots.length === 0) {
      console.log(chalk.yellow('⚠️  Cảnh báo: Không có bot Telegram nào được thiết lập. Thông báo Telegram sẽ bị tắt.'));
    }
  }

  // Gửi thông báo đến Telegram (hỗ trợ nhiều bot và nhiều chat ID)
  async sendTelegramNotification(message) {
    if (this.bots.length === 0) {
      console.log(chalk.yellow('⚠️  Telegram không được cấu hình, bỏ qua thông báo.'));
      return;
    }

    let successCount = 0;
    
    for (const botConfig of this.bots) {
      const { bot: currentBot, chatIds } = botConfig;
      
      // Nếu có chat ID cụ thể cho bot này, gửi đến các chat ID đó
      if (chatIds && chatIds.length > 0) {
        for (const chatId of chatIds) {
          if (chatId) {
            try {
              await currentBot.telegram.sendMessage(chatId.trim(), message, {
                parse_mode: 'HTML'
              });
              console.log(chalk.green(`✅ Đã gửi thông báo Telegram thành công đến chat ID: ${chatId.trim()}`));
              successCount++;
            } catch (error) {
              // Chỉ ghi log lỗi nếu không phải là lỗi chat not found hoặc lỗi liên quan đến quyền
              if (!error.message.includes('chat not found') && 
                  !error.message.includes('bot was blocked') && 
                  !error.message.includes('bot was kicked') &&
                  !error.message.includes('user is deactivated') &&
                  !error.message.includes('group is deactivated')) {
                console.error(chalk.red(`❌ Lỗi khi gửi thông báo Telegram đến chat ID ${chatId.trim()}:`, error.message));
              } else {
                // Ghi log nhưng không hiển thị lỗi chi tiết cho các lỗi phổ biến
                console.log(chalk.yellow(`⚠️  Không thể gửi đến chat ID ${chatId.trim()} (chat không tồn tại hoặc bot bị chặn)`));
              }
            }
          }
        }
      } else {
        // Nếu không có chat ID cụ thể cho bot này, bỏ qua
        console.log(chalk.yellow('⚠️  Bot không có chat ID được cấu hình, bỏ qua gửi thông báo.'));
      }
    }
    
    if (successCount === 0) {
      console.log(chalk.yellow('⚠️  Không thể gửi thông báo đến bất kỳ bot nào.'));
    }
  }

  // Thêm địa chỉ ví vào danh sách theo dõi
  addAddress(address) {
    if (TronWeb.isAddress(address)) {
      this.monitoredAddresses.add(address);
      console.log(chalk.green(`✓ Đã thêm địa chỉ vào danh sách theo dõi: ${address}`));
      
      // Khởi tạo lưu trữ giao dịch cho địa chỉ
      this.transactionHistory.set(address, new Set());
      
      // Kiểm tra số dư ban đầu
      this.checkBalance(address);
      return true;
    } else {
      console.log(chalk.red(`✗ Địa chỉ không hợp lệ: ${address}`));
      return false;
    }
  }

  // Kiểm tra số dư của địa chỉ bằng Tronscan API
  async checkBalance(address) {
    try {
      // Sử dụng TronGrid API để lấy thông tin số dư USDT
      const url = `${TRONGRID_API_BASE}/accounts/${address}`;
      
      const apiResult = await makeApiRequest(url);
      
      if (!apiResult.success) {
        console.warn(chalk.yellow(`⚠️  TronGrid API phản hồi không thành công cho địa chỉ ${address}: ${apiResult.type}`));
        
        // Nếu phản hồi là HTML chứa lỗi, trả về số dư trước đó
        if (apiResult.type === 'html' || apiResult.type === 'unknown') {
          console.error(chalk.red(`Lỗi từ Tronscan API: ${apiResult.data.substring(0, 200)}...`));
          return this.addressBalances.get(address) || 0; // Trả về số dư trước đó nếu có
        }
        
        return this.addressBalances.get(address) || 0;
      }
      
      let usdtBalance = 0;
      const data = apiResult.data;
      
      // TronGrid response: { data: { data: [...], success: true, meta: {...} } }
      // Trc20 data is in data.data[0].trc20
      const accountData = data.data && (Array.isArray(data.data) ? data.data[0] : data.data);
      
      console.log(chalk.cyan(`[DEBUG] API response: success=${data.success}, hasData=!!data.data`));
      
      if (accountData && accountData.trc20) {
        const usdtTokenId = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
        const trc20Array = accountData.trc20;
        if (Array.isArray(trc20Array)) {
          const usdtEntry = trc20Array.find(entry => entry && entry[usdtTokenId]);
          if (usdtEntry) {
            usdtBalance = parseFloat(usdtEntry[usdtTokenId]) / 1000000;
            console.log(chalk.green(`[DEBUG] Found USDT: ${usdtBalance}`));
          }
        }
      } else {
        console.log(chalk.yellow('[DEBUG] No trc20 data'));
      }
      
      // Alternative: Check if balance is directly in data
      if (usdtBalance === 0 && data && data.balance) {
        // If balance is in SUN (1 TRX = 1,000,000 SUN)
        usdtBalance = parseFloat(data.balance) / 1000000;
      }

      const previousBalance = this.addressBalances.get(address) || 0;
      const balanceChange = usdtBalance - previousBalance;
      this.addressBalances.set(address, usdtBalance);

      if (Math.abs(balanceChange) > 0.000001) {
        const newTxs = await this.getNewTransactions(address);
        await this.displayBalanceChangeWithTransactions(address, previousBalance, usdtBalance, balanceChange, newTxs);
      }

      return usdtBalance;
    } catch (error) {
      console.error(chalk.red(`Lỗi kiểm tra số dư ${address}:`, error.message));
      return this.addressBalances.get(address) || 0;
    }
  }

  // Lấy giao dịch mới
  async getNewTransactions(address) {
    try {
      const url = `${TRONGRID_API_BASE}/accounts/${address}/transactions/trc20?limit=${this.transactionLimit}&tokenId=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;
      const apiResult = await makeApiRequest(url);
      if (!apiResult.success) return [];
      
      const data = apiResult.data;
      const txs = data && (Array.isArray(data) ? data : data.data);
      if (!txs || !Array.isArray(txs)) return [];
      
      const newTxs = [];
      for (const tx of txs) {
        const txId = tx.transaction_id || tx.transactionHash || tx.txID || tx.hash;
        if (!this.transactionHistory.get(address).has(txId)) {
          this.transactionHistory.get(address).add(txId);
          newTxs.push(tx);
        }
      }
      return newTxs;
    } catch (error) {
      console.error(chalk.red('Lỗi lấy giao dịch:', error.message));
      return [];
    }
  }

  // Hiển thị biến động số dư + giao dịch (gộp chung)
  async displayBalanceChangeWithTransactions(address, prevBal, currBal, change, txs = []) {
    const timeStr = new Date().toLocaleString();
    const type = change > 0 ? '🟢 NHẬN' : '🔴 CHUYỂN';
    const sign = change > 0 ? '+' : '';
    
    // Lấy thông tin giao dịch đầu tiên
    const firstTx = txs.length > 0 ? txs[0] : null;
    const fromAddr = firstTx ? firstTx.from : '';
    const toAddr = firstTx ? firstTx.to : '';
    
    console.log(chalk.yellow(`\n┌─ ${type} ${change.toFixed(6)} USDT ──────`));
    console.log(chalk.cyan(`│ 📍 ${address}`));
    if (firstTx) {
      console.log(chalk.cyan(`│ 📤 Từ: ${fromAddr.slice(0,8)}...${fromAddr.slice(-6)}`));
      console.log(chalk.cyan(`│ 📥 Đến: ${toAddr.slice(0,8)}...${toAddr.slice(-6)}`));
    }
    console.log(chalk.gray(`│ 💰 ${prevBal.toFixed(6)} → ${currBal.toFixed(6)} USDT`));
    console.log(chalk.yellow('└────────────────────────────────────\n'));

    let msg = `<b>${type}</b>\n\n📅 ${timeStr}\n📍 <code>${address}</code>`;
    if (firstTx) {
      msg += `\n📤 Từ: <code>${fromAddr}</code>\n📥 Đến: <code>${toAddr}</code>`;
    }
    msg += `\n💰 ${prevBal.toFixed(6)} → ${currBal.toFixed(6)} USDT\n📊 ${sign}${change.toFixed(6)} USDT (${change > 0 ? 'NHẬN' : 'CHUYỂN'})`;
    
    await this.sendTelegramNotification(msg.trim());
  }

  // Theo dõi các giao dịch USDT (chỉ lưu lịch sử, không gửi thông báo riêng - đã gộp vào displayBalanceChangeWithTransactions)
  async monitorTransactions(address) {
    try {
      // Lấy lịch sử giao dịch USDT (TRC20) từ TronGrid API
      const url = `${TRONGRID_API_BASE}/accounts/${address}/transactions/trc20?limit=${this.transactionLimit}&tokenId=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;
      
      const apiResult = await makeApiRequest(url);
      
      if (!apiResult.success) {
        return;
      }
      
      const data = apiResult.data;
      const transactionsData = data && (Array.isArray(data) ? data : data.data);
      
      if (transactionsData && Array.isArray(transactionsData)) {
        for (const tx of transactionsData) {
          const txId = tx.transaction_id || tx.transactionHash || tx.txID || tx.hash;
          
          // Chỉ lưu vào lịch sử, không gửi thông báo riêng
          if (!this.transactionHistory.get(address).has(txId)) {
            this.transactionHistory.get(address).add(txId);
          }
        }
      }
    } catch (error) {
      console.error(chalk.red('Lỗi khi theo dõi giao dịch:', error.message));
    }
  }

  // =========================================
  // Hàm cũ - Không còn sử dụng riêng lẻ
  // Đã gộp vào displayBalanceChangeWithTransactions
  // =========================================
  async displayNewTransactions(transactions, monitoredAddress) {
    // Hàm này không còn được gọi riêng lẻ
    // Tất cả thông báo giao dịch đã được gộp vào displayBalanceChangeWithTransactions
  }

  // Theo dõi liên tục
  async startMonitoring() {
    console.log(chalk.blue('🚀 Bắt đầu theo dõi USDT realtime...\n'));
    console.log(chalk.cyan(`⏱️  Khoảng thời gian kiểm tra: ${(this.checkInterval / 1000)} giây`));
    console.log(chalk.cyan(`📊 Số lượng giao dịch hiển thị: ${this.transactionLimit}\n`));
    
    // Gửi thông báo bắt đầu theo dõi nếu có Telegram
    if (bots.length > 0) {
      const startTime = new Date().toLocaleString();
      const startMessage = `
🤖 <b>USDT TRACKER ĐÃ BẮT ĐẦU</b>

<b>⏰ Thời gian bắt đầu:</b> ${startTime}
<b>📍 Số địa chỉ đang theo dõi:</b> ${this.monitoredAddresses.size}
      `.trim();
      
      await this.sendTelegramNotification(startMessage);
    }
    
    // Kiểm tra ngay lập tức
    for (const address of this.monitoredAddresses) {
      await this.checkBalance(address);
      await this.monitorTransactions(address);
    }
    
    // Kiểm tra định kỳ
    setInterval(async () => {
      for (const address of this.monitoredAddresses) {
        await this.checkBalance(address);
        await this.monitorTransactions(address);
      }
    }, this.checkInterval);
  }

  // Hiển thị bảng tổng quan
  displayOverview() {
    console.log(chalk.blue('\n┌─ 📋 TỔNG QUAN THEO DÕI USDT ────────────────'));
    for (const [address, balance] of this.addressBalances) {
      console.log(chalk.cyan(`│ 📍 ${address.substring(0, 10)}...${address.substring(address.length - 6)}:`));
      console.log(chalk.magenta(`│    ${balance.toFixed(6)} USDT`));
    }
    console.log(chalk.blue('└─────────────────────────────────────────────\n'));
  }

  // Thêm nhiều địa chỉ cùng lúc
  addMultipleAddresses(addresses) {
    for (const address of addresses) {
      this.addAddress(address);
    }
  }
}

// Sử dụng script
const tracker = new TelegramUSDTTracker();

// Thêm địa chỉ từ tham số dòng lệnh hoặc từ biến môi trường
const args = process.argv.slice(2);
if (args.length > 0) {
  // Thêm địa chỉ từ tham số dòng lệnh
  args.forEach(addr => tracker.addAddress(addr));
} else {
  // Thử lấy từ biến môi trường
  const envAddresses = process.env.MONITORED_ADDRESSES;
  if (envAddresses) {
    const addresses = envAddresses.split(',').map(addr => addr.trim());
    tracker.addMultipleAddresses(addresses);
  } else {
    console.log(chalk.yellow('Sử dụng: node telegram-tracker.js <địa_chỉ_ví_TRON>'));
    console.log(chalk.yellow('Hoặc thiết lập biến môi trường MONITORED_ADDRESSES trong .env'));
  }
}

// Bắt đầu theo dõi
setTimeout(() => {
  tracker.startMonitoring();
}, 2000);

// Hiển thị tổng quan mỗi 5 phút
setInterval(() => {
  tracker.displayOverview();
}, 300000); // 5 phút

module.exports = TelegramUSDTTracker;