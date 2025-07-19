require('dotenv').config();
const { firefox } = require('playwright-firefox');
const { default: fetch } = require('node-fetch');
const sqlite3 = require('sqlite3').verbose();
const dayjs = require('dayjs');
const http = require('http');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { exec } = require('child_process');

dayjs.extend(utc);
dayjs.extend(timezone);

const EMAIL = 'sanjaya256890@gmail.com';
const PASSWORD = 'Sanjay@001';
const BOT_TOKEN = '7752038917:AAG3KfU-d4n5ysuOvq1qomNx0JXA4dGcjmA';
const CHAT_ID = '-1002541578739';
const LOGIN_URL = 'https://www.ivasms.com/login';
const SMS_URL = 'https://www.ivasms.com/portal/live/my_sms';

// Print startup banner
console.log(`
🚀 Starting OTP Monitor Bot
━━━━━━━━━━━━━━━━━━━━━━━━━
📧 Email: ${EMAIL}
🤖 Bot Token: ${BOT_TOKEN}
💬 Chat ID: ${CHAT_ID}
━━━━━━━━━━━━━━━━━━━━━━━━━
`);

const db = new sqlite3.Database('./db.sqlite');
db.run('CREATE TABLE IF NOT EXISTS otps (otp TEXT, number TEXT, UNIQUE(otp, number))');

async function sendTelegram({ number, otp, message }) {
  const text = [
    `☎️ Number: *${number}*`,
    `🔑 OTP Code: *\u{1F4DD} ${otp} \u{1F4DD}*`,
    `📱 Message:`,
    `${message}`
  ].join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'Markdown'
      })
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('Telegram API error:', data);
    } else {
      console.log('Telegram message sent:', data.result.message_id);
      console.log(`✅ Successfully sent OTP: ${otp} for number: ${number}`);
    }
  } catch (err) {
    console.error('Telegram fetch error:', err);
  }
}

async function login(page) {
  console.log('\n=== 🔐 LOGIN PROCESS STARTED ===');
  console.log('🌐 Step 1: Navigating to login page...');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
  
  console.log('📝 Step 2: Filling login form');
  console.log(`   Email: ${EMAIL.slice(0, 3)}***${EMAIL.slice(-3)}`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('input[name="remember"]');
  
  console.log('🔑 Step 3: Submitting login form...');
  try {
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle' })
    ]);
    
    // Check login status
    const loginError = await page.$('.alert-danger');
    const isLoggedIn = await page.evaluate(() => {
      return !document.querySelector('.login-form') && 
             !document.querySelector('.alert-danger');
    });
    
    if (loginError || !isLoggedIn) {
      console.error('\n❌ LOGIN FAILED ❌');
      console.error('Please check your credentials and try again');
      return false;
    }
    
    console.log('\n✅ LOGIN SUCCESSFUL ✅');
    console.log('=== 🔐 LOGIN PROCESS COMPLETED ===\n');
    return true;
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    return false;
  }
}

// Create HTTP server for keep-alive
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is alive!');
});

const PORT = process.env.PORT || 3002;

function startServer() {
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${PORT} is already in use. Attempting to close the port...`);
      exec(`fuser -k ${PORT}/tcp`, (execErr) => {
        if (execErr) {
          console.error('Failed to close the port:', execErr);
        } else {
          console.log(`Port ${PORT} closed. Restarting server...`);
          setTimeout(() => startServer(), 1000);
        }
      });
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer();

async function monitor() {
  console.log('🟢 Bot started');
  console.log('📱 Launching Firefox...');
  try {
    // Launch Firefox browser
    const browser = await firefox.launch({
      headless: true
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();

    async function ensureLoggedIn() {
      if (page.url() !== SMS_URL) {
        const loginSuccess = await login(page);
        if (!loginSuccess) {
          throw new Error('Failed to log in to IVASMS');
        }
        console.log('🌐 Navigating to SMS page...');
        await page.goto(SMS_URL, { waitUntil: 'networkidle' });
        console.log('✅ Successfully accessed SMS page');
        
        // Send a test message to Telegram
        const testMsg = {
          number: '✅',
          service: '✅',
          otp: '✅',
          message: '🤖 Bot successfully logged in and started monitoring IVASMS live page.',
          time: dayjs().tz('Asia/Kolkata').format('DD/MM/YYYY, HH:mm:ss')
        };
        await sendTelegram(testMsg);
      }
    }

    console.log('🔑 Attempting to log in...');
    await ensureLoggedIn();
    console.log('✅ Successfully logged in');
    console.log('🔍 Ready to monitor live SMS page');

    // Remove any logic that refreshes the page
    // Ensure the bot strictly waits for OTP updates without refreshing
    console.log('🔍 Monitoring live SMS page without refreshing...');

    // Monitor for session expiry without refreshing
    setInterval(async () => {
      const isLoginPage = await page.evaluate(() => document.location.pathname === '/login');
      if (isLoginPage) {
        console.log('⚠️ Session expired, attempting to login again...');
        await ensureLoggedIn();
      }
    }, 300000); // Check every 5 minutes

    // Ensure no refresh logic is triggered
    console.log('✅ Strictly waiting for OTP updates without refreshing the page.');

    // Monitor for new messages
    await page.evaluate(() => {
      let lastRowKey = null;

      function extractRow(tr) {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 5) return null;

        // Extract data based on the table structure
        const countryCode = tds[0].innerText.trim(); // Country Code
        const service = tds[1].innerText.trim(); // Service (SID)
        const message = tds[4].innerText.trim(); // Message Content

        // Extract the mobile number from the row below the country name
        const nextRow = tr.nextElementSibling;
        const mobileNumber = nextRow ? nextRow.querySelector('td').innerText.trim() : null;

        // Extract OTP from the message content
        const otpMatch = message.match(/\b\d{4,6}\b/);
        const otp = otpMatch ? otpMatch[0] : null;

        return {
          countryCode,
          service,
          number: mobileNumber,
          otp,
          message
        };
      }

      const observer = new MutationObserver((mutations) => {
        const table = document.querySelector('table');
        if (!table) return;

        const rows = table.querySelectorAll('tbody tr');
        if (!rows || rows.length === 0) return;

        rows.forEach(tr => {
          const row = extractRow(tr);
          if (!row || !row.otp || !row.number) return;

          const key = `${row.otp}_${row.number}`;
          if (key !== lastRowKey) {
            lastRowKey = key;
            window.processRow(row);
          }
        });
      });

      const table = document.querySelector('table');
      if (table) {
        observer.observe(table.querySelector('tbody'), {
          childList: true,
          subtree: true
        });

        // Process initial row
        const tr = table.querySelector('tbody tr');
        if (tr) {
          const row = extractRow(tr);
          if (row && row.otp && row.number) {
            lastRowKey = `${row.otp}_${row.number}`;
            window.processRow(row);
          }
        }
      }
    });

    // Handle row processing
    await page.exposeFunction('processRow', async (row) => {
      const { service, number, otp, message } = row;
      
      db.get('SELECT 1 FROM otps WHERE otp=? AND number=?', [otp, number], async (err, row) => {
        if (err) {
          console.error('DB error:', err);
          return;
        }
        if (!row) {
          db.run('INSERT INTO otps (otp, number) VALUES (?, ?)', [otp, number]);
          const time = dayjs().tz('Asia/Kolkata').format('DD/MM/YYYY, HH:mm:ss');
          await sendTelegram({ number, otp, message });
          console.log(`Extracted OTP: ${otp}`);
        }
      });
    });

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

monitor();
