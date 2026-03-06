'use strict';

// ╔══════════════════════════════════════════════════════════════╗
// ║           ⚠️  CẤU HÌNH - ĐIỀN TRƯỚC KHI CÀI ĐẶT            ║
// ╠══════════════════════════════════════════════════════════════╣
// ║  Webhook nhận token (POST JSON)                              ║
const WEBHOOK_URL = 'https://go.dungmoda.com/webhook/dmg-extension-get-pancake-token';
// ║                                                              ║
// ║  Endpoint kiểm tra token còn sống không (POST)              ║
// ║  Extension sẽ gọi: POST STATUS_CHECK_URL                    ║
// ║  Body: { "device_uuid": "xxx" }                             ║
// ║  Webhook trả về: { "valid": true/false }                    ║
const STATUS_CHECK_URL = 'https://go.dungmoda.com/webhook/dmg-extension-check-token-status';
// ║                                                              ║
// ║  fb_id của admin — được hiện Admin Panel trong popup         ║
const ADMIN_FB_ID = '120948995064189';
// ║                                                              ║
// ║  Điểm danh — check ca làm việc (POST)                       ║
// ║  Body: { "fb_id": "xxx", "device_uuid": "yyy" }             ║
// ║  Response: { "in_shift": true/false }                       ║
const ATTENDANCE_CHECK_URL   = 'YOUR_ATTENDANCE_CHECK_URL_HERE';
// ║  Điểm danh — gửi kết quả xác nhận (POST)                    ║
// ║  Body: { fb_id, device_uuid, confirmed, reason, ... }       ║
const ATTENDANCE_CONFIRM_URL = 'YOUR_ATTENDANCE_CONFIRM_URL_HERE';
// ╚══════════════════════════════════════════════════════════════╝

const SEND_INTERVAL_MS       = 12 * 60 * 60 * 1000; // 12 giờ
const STATUS_CHECK_INTERVAL  = 60;                   // phút
const ATTENDANCE_TIMEOUT_MIN = 5;                    // phút chờ xác nhận
const ATTENDANCE_MIN_MIN     = 60;                   // random min (phút)
const ATTENDANCE_MAX_MIN     = 240;                  // random max (phút)

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

async function sendToWebhook(token, jwtPayload, config = {}) {
  const deviceUUID = await getDeviceUUID();
  const { device_name = 'Unknown Device' } = await chrome.storage.local.get('device_name');

  const payload = {
    token,
    account_name : jwtPayload.name || jwtPayload.fb_name || 'Unknown',
    device_name,
    device_uuid  : deviceUUID,
    status       : 'active',
    type         : config.type       ?? 'chat',
    is_admin     : config.is_admin   ?? 0,
    automation   : config.automation ?? 1,
    user_uid     : jwtPayload.uid    || null,
    user_fb_id   : jwtPayload.fb_id  || null,
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

async function processToken(token, config = {}) {
  const jwt = decodeJWT(token);
  if (!jwt) return;

  // Bỏ qua token đã hết hạn
  const nowSec = Math.floor(Date.now() / 1000);
  if (jwt.exp && jwt.exp < nowSec) return;

  // Kiểm tra admin + whitelist cho POS
  if (config.type === 'pos') {
    const isAdmin = jwt.fb_id === ADMIN_FB_ID;
    if (isAdmin) {
      await chrome.storage.local.set({ is_admin: true });
    } else {
      const { pos_whitelist = [] } = await chrome.storage.local.get('pos_whitelist');
      if (!pos_whitelist.includes(jwt.fb_id)) return;
    }
  }

  // Lưu token vừa bắt được (dùng cho nút Gửi lại)
  await chrome.storage.local.set({
    last_captured_token   : token,
    last_captured_account : jwt.name || jwt.fb_name || 'Unknown',
    last_captured_exp     : jwt.exp,
    last_captured_config  : config,
    current_fb_id         : jwt.fb_id || null
  });

  const { last_token, last_sent_time, force_resend } =
    await chrome.storage.local.get(['last_token', 'last_sent_time', 'force_resend']);

  const isNewToken  = token !== last_token;
  const isOver12h   = !last_sent_time || (Date.now() - last_sent_time) > SEND_INTERVAL_MS;
  const shouldForce = force_resend === true;

  if (isNewToken || isOver12h || shouldForce) {
    await sendToWebhook(token, jwt, config);
  }
}

// ─────────────────────────────────────────────
//  Status check (webhook phản hồi token còn sống?)
// ─────────────────────────────────────────────

async function checkTokenStatus() {
  if (!STATUS_CHECK_URL || STATUS_CHECK_URL === 'YOUR_STATUS_CHECK_URL_HERE') return;

  const deviceUUID = await getDeviceUUID();
  try {
    const res  = await fetch(STATUS_CHECK_URL, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({ device_uuid: deviceUUID })
    });
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
//  Attendance (Điểm danh)
// ─────────────────────────────────────────────

function scheduleNextAttendance() {
  chrome.alarms.clear('attendanceCheck', () => {
    const randomMs =
      (ATTENDANCE_MIN_MIN + Math.random() * (ATTENDANCE_MAX_MIN - ATTENDANCE_MIN_MIN)) * 60 * 1000;
    chrome.alarms.create('attendanceCheck', { when: Date.now() + randomMs });
  });
}

async function submitAttendance(confirmed, reason, pendingSince) {
  if (!ATTENDANCE_CONFIRM_URL || ATTENDANCE_CONFIRM_URL === 'YOUR_ATTENDANCE_CONFIRM_URL_HERE') return;
  const { current_fb_id } = await chrome.storage.local.get('current_fb_id');
  const deviceUUID = await getDeviceUUID();
  const responseSec = pendingSince ? Math.round((Date.now() - pendingSince) / 1000) : null;
  try {
    await fetch(ATTENDANCE_CONFIRM_URL, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({
        fb_id            : current_fb_id,
        device_uuid      : deviceUUID,
        confirmed,
        reason,
        response_time_sec: responseSec,
        timestamp        : new Date().toISOString()
      })
    });
  } catch { /* silent */ }
  await chrome.storage.local.set({ attendance_pending: false, attendance_pending_since: null });
  scheduleNextAttendance();
}

async function checkAttendance() {
  if (!ATTENDANCE_CHECK_URL || ATTENDANCE_CHECK_URL === 'YOUR_ATTENDANCE_CHECK_URL_HERE') return;

  const { current_fb_id } = await chrome.storage.local.get('current_fb_id');
  if (!current_fb_id) { scheduleNextAttendance(); return; }

  const deviceUUID = await getDeviceUUID();

  try {
    const res  = await fetch(ATTENDANCE_CHECK_URL, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({ fb_id: current_fb_id, device_uuid: deviceUUID })
    });
    const data = await res.json();
    if (!data.in_shift) { scheduleNextAttendance(); return; }
  } catch {
    scheduleNextAttendance();
    return;
  }

  // Nhân viên đang trong ca → hiện overlay
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const canInject = tab &&
    tab.url &&
    !tab.url.startsWith('chrome://') &&
    !tab.url.startsWith('chrome-extension://') &&
    !tab.url.startsWith('about:');

  const now = Date.now();
  await chrome.storage.local.set({ attendance_pending: true, attendance_pending_since: now });
  chrome.alarms.create('attendanceTimeout', { delayInMinutes: ATTENDANCE_TIMEOUT_MIN });

  if (canInject) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'show_attendance' });
    } catch {
      // Content script chưa load → fallback notification
      showAttendanceNotification();
    }
  } else {
    showAttendanceNotification();
  }
}

function showAttendanceNotification() {
  chrome.notifications.create('dmg_attendance', {
    type    : 'basic',
    iconUrl : 'icons/logo.png',
    title   : '📋 Điểm Danh — DMG Helper',
    message : 'Xác nhận bạn đang có mặt và làm việc. Còn 5 phút!',
    buttons : [{ title: '✅ Xác nhận có mặt' }],
    requireInteraction: true
  });
}

// Khi nhân viên click nút trong Chrome Notification
chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  if (notifId !== 'dmg_attendance' || btnIdx !== 0) return;
  chrome.notifications.clear('dmg_attendance');
  chrome.alarms.clear('attendanceTimeout');
  const { attendance_pending_since } = await chrome.storage.local.get('attendance_pending_since');
  await submitAttendance(true, 'confirmed', attendance_pending_since);
});

// ─────────────────────────────────────────────
//  Listeners (đăng ký synchronous ở top-level)
// ─────────────────────────────────────────────

// Listener 1: pancake.vn — type: chat, automation: 1
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    try {
      const url   = new URL(details.url);
      const token = url.searchParams.get('access_token');
      if (token) processToken(token, { type: 'chat', is_admin: 0, automation: 1 });
    } catch { /* ignore */ }
  },
  { urls: ['*://pancake.vn/api/*'] }
);

// Listener 2: pos.pancake.vn — type: pos, automation: 0
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    try {
      const url   = new URL(details.url);
      const token = url.searchParams.get('access_token');
      if (token) processToken(token, { type: 'pos', is_admin: 0, automation: 0 });
    } catch { /* ignore */ }
  },
  { urls: ['*://pos.pancake.vn/api/*'] }
);

// Alarm handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkTokenStatus')  checkTokenStatus();
  if (alarm.name === 'attendanceCheck')   checkAttendance();
  if (alarm.name === 'attendanceTimeout') {
    // Timeout — nhân viên không phản hồi
    chrome.alarms.clear('attendanceTimeout');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) { try { await chrome.tabs.sendMessage(tab.id, { action: 'hide_attendance' }); } catch {} }
    chrome.notifications.clear('dmg_attendance');
    const { attendance_pending, attendance_pending_since } =
      await chrome.storage.local.get(['attendance_pending', 'attendance_pending_since']);
    if (attendance_pending) await submitAttendance(false, 'timeout', attendance_pending_since);
  }
});

// Messages từ popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // Gửi lại token ngay lập tức
  if (msg.action === 'force_send') {
    (async () => {
      const { last_captured_token, last_captured_config } =
        await chrome.storage.local.get(['last_captured_token', 'last_captured_config']);

      if (!last_captured_token) {
        sendResponse({ ok: false, reason: 'no_token' });
        return;
      }
      const jwt = decodeJWT(last_captured_token);
      if (!jwt) {
        sendResponse({ ok: false, reason: 'invalid_token' });
        return;
      }
      // Bypass 12h check — gửi thẳng, giữ đúng config (type/automation) của nguồn bắt token
      const success = await sendToWebhook(last_captured_token, jwt, last_captured_config || {});
      sendResponse({ ok: success });
    })();
    return true; // async response
  }

  // Nhân viên xác nhận điểm danh từ overlay
  if (msg.action === 'attendance_confirmed') {
    (async () => {
      chrome.alarms.clear('attendanceTimeout');
      const { attendance_pending, attendance_pending_since } =
        await chrome.storage.local.get(['attendance_pending', 'attendance_pending_since']);
      if (attendance_pending) await submitAttendance(true, 'confirmed', attendance_pending_since);
      sendResponse({ ok: true });
    })();
    return true;
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
  chrome.alarms.get('attendanceCheck', (alarm) => {
    if (!alarm) scheduleNextAttendance();
  });
}

chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);
