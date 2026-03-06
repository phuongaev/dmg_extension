'use strict';

// ─────────────────────────────────────────────
//  Attendance overlay — content script
//  Nhận message 'show_attendance' từ background
//  Gửi 'attendance_confirmed' khi nhân viên click
// ─────────────────────────────────────────────

const OVERLAY_ID  = 'dmg-attendance-overlay';
const TIMEOUT_SEC = 300; // 5 phút — phải khớp với background.js

let countdownTimer = null;

// ── Tạo overlay DOM ───────────────────────────

function createOverlay() {
  if (document.getElementById(OVERLAY_ID)) return; // đã hiện rồi

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div class="dmg-backdrop"></div>
    <div class="dmg-modal">
      <div class="dmg-logo">DMG</div>
      <div class="dmg-title">📋 Điểm Danh</div>
      <div class="dmg-desc">Xác nhận bạn đang có mặt và làm việc</div>
      <div class="dmg-timer" id="dmg-countdown">05:00</div>
      <button class="dmg-btn" id="dmg-confirm-btn">✅ Xác nhận có mặt</button>
      <div class="dmg-note">Không phản hồi trong 5 phút → ghi nhận vắng mặt</div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #${OVERLAY_ID} * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Roboto', 'Segoe UI', sans-serif; }
    #${OVERLAY_ID} {
      position: fixed; inset: 0; z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
    }
    #${OVERLAY_ID} .dmg-backdrop {
      position: absolute; inset: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(3px);
    }
    #${OVERLAY_ID} .dmg-modal {
      position: relative;
      background: #ffffff;
      border-radius: 16px;
      padding: 36px 32px 28px;
      width: 340px;
      text-align: center;
      box-shadow: 0 24px 60px rgba(0,0,0,0.35);
      animation: dmg-pop .25s cubic-bezier(.34,1.56,.64,1);
    }
    @keyframes dmg-pop {
      from { transform: scale(0.85); opacity: 0; }
      to   { transform: scale(1);    opacity: 1; }
    }
    #${OVERLAY_ID} .dmg-logo {
      display: inline-block;
      background: linear-gradient(135deg, #f97316, #ea580c);
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 1px;
      padding: 4px 10px;
      border-radius: 6px;
      margin-bottom: 16px;
    }
    #${OVERLAY_ID} .dmg-title {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 8px;
    }
    #${OVERLAY_ID} .dmg-desc {
      font-size: 14px;
      color: #64748b;
      margin-bottom: 24px;
      line-height: 1.5;
    }
    #${OVERLAY_ID} .dmg-timer {
      font-size: 42px;
      font-weight: 700;
      color: #f97316;
      font-family: 'Roboto Mono', monospace;
      margin-bottom: 24px;
      letter-spacing: 2px;
    }
    #${OVERLAY_ID} .dmg-timer.dmg-urgent { color: #dc2626; animation: dmg-pulse 1s ease-in-out infinite; }
    @keyframes dmg-pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
    #${OVERLAY_ID} .dmg-btn {
      width: 100%;
      background: linear-gradient(135deg, #16a34a, #15803d);
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 14px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      transition: filter .15s, transform .1s;
      margin-bottom: 12px;
    }
    #${OVERLAY_ID} .dmg-btn:hover  { filter: brightness(1.1); }
    #${OVERLAY_ID} .dmg-btn:active { transform: scale(0.97); }
    #${OVERLAY_ID} .dmg-note {
      font-size: 11px;
      color: #94a3b8;
      line-height: 1.4;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(overlay);

  // Countdown timer
  let remaining = TIMEOUT_SEC;
  const timerEl = document.getElementById('dmg-countdown');

  countdownTimer = setInterval(() => {
    remaining--;
    const m = String(Math.floor(remaining / 60)).padStart(2, '0');
    const s = String(remaining % 60).padStart(2, '0');
    timerEl.textContent = `${m}:${s}`;
    if (remaining <= 60) timerEl.classList.add('dmg-urgent');
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      removeOverlay();
    }
  }, 1000);

  // Nút xác nhận
  document.getElementById('dmg-confirm-btn').addEventListener('click', () => {
    clearInterval(countdownTimer);
    chrome.runtime.sendMessage({ action: 'attendance_confirmed' });
    removeOverlay();
  });
}

function removeOverlay() {
  const el = document.getElementById(OVERLAY_ID);
  if (el) el.remove();
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
}

// ── Lắng nghe message từ background ──────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'show_attendance') createOverlay();
  if (msg.action === 'hide_attendance') removeOverlay();
});
