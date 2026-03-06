'use strict';

// ╔══════════════════════════════════════════════════════════════╗
// ║           ⚠️  CẤU HÌNH - ĐIỀN TRƯỚC KHI CÀI ĐẶT            ║
// ╠══════════════════════════════════════════════════════════════╣
// ║  Webhook nhận token (POST JSON)                              ║
const WEBHOOK_URL = 'https://go.dungmoda.com/webhook/dmg-extension-get-pancake-token';
// ║                                                              ║
// ║  Endpoint kiểm tra token còn sống không (GET)               ║
// ║  Extension sẽ gọi: GET STATUS_CHECK_URL?device_uuid=xxx     ║
// ║  Webhook trả về: { "valid": true/false }                    ║
const STATUS_CHECK_URL = 'YOUR_STATUS_CHECK_URL_HERE';
// ╚══════════════════════════════════════════════════════════════╝

const SEND_INTERVAL_MS       = 12 * 60 * 60 * 1000; // 12 giờ
const STATUS_CHECK_INTERVAL  = 60;                   // phút

// ─────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────

function decodeJWT(token) {
  try {
    const raw = token.split('.')[1];
    if (!raw) return null;
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64).split('').map(c =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function getDeviceUUID() {
  const { device_uuid } = await chrome.storage.local.get('device_uuid');
  if (device_uuid) return device_uuid;
  const uuid = generateUUID();
  await chrome.storage.local.set({ device_uuid: uuid });
  return uuid;
}

async function addHistory(account, device, success) {
  const { history = [] } = await chrome.storage.local.get('history');
  history.unshift({
    time: new Date().toLocaleString('vi-VN', {
      hour: '2-digit', minute: '2-digit',
      day: '2-digit', month: '2-digit', year: '2-digit'
    }),
    account: account || '—',
    device:  device  || '—',
    success
  });
  if (history.length > 20) history.length = 20;
  await chrome.storage.local.set({ history });
}

// ─────────────────────────────────────────────
//  Webhook sender
// ─────────────────────────────────────────────

async function sendToWebhook(token, jwtPayload) {
  const deviceUUID = await getDeviceUUID();
  const { device_name = 'Unknown Device' } = await chrome.storage.local.get('device_name');

  const payload = {
    token,
    account_name : jwtPayload.name || jwtPayload.fb_name || 'Unknown',
    device_name,
    device_uuid  : deviceUUID,
    status       : 'active',
    type         : 'chat',
    is_admin     : 0,
    automation   : 1,
    token_exp    : jwtPayload.exp,
    sent_at      : new Date().toISOString()
  };

  let success = false;
  try {
    const res = await fetch(WEBHOOK_URL, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify(payload)
    });
    success = res.ok;
  } catch {
    success = false;
  }

  // Persist state
  const update = {
    last_sent_status    : success ? 'success' : 'failed',
    current_account     : payload.account_name,
    current_token_exp   : jwtPayload.exp,
    token_valid         : success,
    force_resend        : false
  };
  if (success) {
    update.last_token     = token;
    update.last_sent_time = Date.now();
  }
  await chrome.storage.local.set(update);
  await addHistory(payload.account_name, device_name, success);

  return success;
}

// ─────────────────────────────────────────────
//  Core token processing
// ─────────────────────────────────────────────

async function processToken(token) {
  const jwt = decodeJWT(token);
  if (!jwt) return;

  // Bỏ qua token đã hết hạn
  const nowSec = Math.floor(Date.now() / 1000);
  if (jwt.exp && jwt.exp < nowSec) return;

  // Lưu token vừa bắt được (dùng cho nút Gửi lại)
  await chrome.storage.local.set({
    last_captured_token   : token,
    last_captured_account : jwt.name || jwt.fb_name || 'Unknown',
    last_captured_exp     : jwt.exp
  });

  const { last_token, last_sent_time, force_resend } =
    await chrome.storage.local.get(['last_token', 'last_sent_time', 'force_resend']);

  const isNewToken  = token !== last_token;
  const isOver12h   = !last_sent_time || (Date.now() - last_sent_time) > SEND_INTERVAL_MS;
  const shouldForce = force_resend === true;

  if (isNewToken || isOver12h || shouldForce) {
    await sendToWebhook(token, jwt);
  }
}

// ─────────────────────────────────────────────
//  Status check (webhook phản hồi token còn sống?)
// ─────────────────────────────────────────────

async function checkTokenStatus() {
  if (!STATUS_CHECK_URL || STATUS_CHECK_URL === 'YOUR_STATUS_CHECK_URL_HERE') return;

  const deviceUUID = await getDeviceUUID();
  try {
    const res  = await fetch(`${STATUS_CHECK_URL}?device_uuid=${deviceUUID}`);
    const data = await res.json();
    if (data.valid === false) {
      // Token đã chết → cờ force_resend, sẽ kích hoạt khi user vào pancake.vn/account
      await chrome.storage.local.set({ token_valid: false, force_resend: true });
    }
  } catch {
    // silent
  }
}

// ─────────────────────────────────────────────
//  Listeners (đăng ký synchronous ở top-level)
// ─────────────────────────────────────────────

// Bắt request đến /api/v1/me?access_token=...
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    try {
      const url   = new URL(details.url);
      const token = url.searchParams.get('access_token');
      if (token) processToken(token);
    } catch { /* ignore */ }
  },
  { urls: ['*://pancake.vn/api/v1/me*'] }
);

// Alarm handler
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkTokenStatus') checkTokenStatus();
});

// Messages từ popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // Gửi lại token ngay lập tức
  if (msg.action === 'force_send') {
    (async () => {
      const { last_captured_token } =
        await chrome.storage.local.get('last_captured_token');

      if (!last_captured_token) {
        sendResponse({ ok: false, reason: 'no_token' });
        return;
      }
      const jwt = decodeJWT(last_captured_token);
      if (!jwt) {
        sendResponse({ ok: false, reason: 'invalid_token' });
        return;
      }
      // Bypass 12h check — gửi thẳng
      const success = await sendToWebhook(last_captured_token, jwt);
      sendResponse({ ok: success });
    })();
    return true; // async response
  }

  return false;
});

// ─────────────────────────────────────────────
//  Bootstrap
// ─────────────────────────────────────────────

function ensureAlarm() {
  chrome.alarms.get('checkTokenStatus', (alarm) => {
    if (!alarm) {
      chrome.alarms.create('checkTokenStatus', {
        periodInMinutes: STATUS_CHECK_INTERVAL
      });
    }
  });
}

chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);
