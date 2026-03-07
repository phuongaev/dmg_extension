'use strict';

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function formatExpiry(expTs) {
  if (!expTs) return { text: '—', cls: 'c-muted' };
  const nowSec  = Math.floor(Date.now() / 1000);
  const diffSec = expTs - nowSec;
  if (diffSec <= 0) return { text: 'Hết hạn ⚠️', cls: 'c-dead' };

  const days  = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const mins  = Math.floor((diffSec % 3600)  / 60);

  if (days >= 30) return { text: `còn ${days} ngày`, cls: 'c-ok' };
  if (days >= 7)  return { text: `còn ${days} ngày`, cls: 'c-warn' };
  if (days >= 1)  return { text: `còn ${days}d ${hours}h`, cls: 'c-warn' };
  if (hours >= 1) return { text: `còn ${hours}h ${mins}m`, cls: 'c-dead' };
  return { text: `còn ${mins} phút`, cls: 'c-dead' };
}

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('vi-VN', {
    hour  : '2-digit', minute : '2-digit',
    day   : '2-digit', month  : '2-digit'
  });
}

// ─────────────────────────────────────────────
//  Render
// ─────────────────────────────────────────────

function renderStatus(state) {
  if (!state) return;

  // Account name — prefer last captured, fallback to stored current
  const account = state.current_account || state.last_captured_account || null;
  const accountEl = document.getElementById('accountName');
  if (account) {
    accountEl.textContent = account;
    accountEl.className = 'card-value';
  } else {
    accountEl.textContent = 'Chưa phát hiện';
    accountEl.className = 'card-value c-muted';
  }

  // Token expiry
  const expTs = state.current_token_exp || state.last_captured_exp || null;
  const expEl  = document.getElementById('tokenExp');
  if (expTs) {
    const { text, cls } = formatExpiry(expTs);
    expEl.textContent = text;
    expEl.className   = `card-value ${cls}`;
  } else {
    expEl.textContent = '—';
    expEl.className   = 'card-value c-muted';
  }

  // Last sent
  const lastSentEl = document.getElementById('lastSent');
  lastSentEl.textContent = formatTime(state.last_sent_time);
  lastSentEl.className   = state.last_sent_time ? 'card-value' : 'card-value c-muted';

  // Last status badge
  const statusEl = document.getElementById('lastStatus');
  if (state.last_sent_status === 'success') {
    statusEl.innerHTML = `
      <span class="badge badge-ok">
        <span class="dot dot-pulse"></span>Thành công
      </span>`;
  } else if (state.last_sent_status === 'failed') {
    statusEl.innerHTML = `
      <span class="badge badge-fail">
        <span class="dot"></span>Thất bại
      </span>`;
  } else {
    statusEl.innerHTML = `
      <span class="badge badge-idle">
        <span class="dot"></span>Chưa gửi
      </span>`;
  }

  // Device UUID
  if (state.device_uuid) {
    document.getElementById('deviceUUID').textContent =
      state.device_uuid.substring(0, 12) + '…';
    document.getElementById('btnCopyUUID').dataset.full = state.device_uuid;
  }

  // History
  renderHistory(state.history || []);
}

function renderHistory(history) {
  const list = document.getElementById('historyList');
  if (!history.length) {
    list.innerHTML = `
      <div class="empty-msg">
        Chưa có lịch sử — vào<br>
        <strong style="color:#f97316">pancake.vn/account</strong> để bắt token
      </div>`;
    return;
  }
  list.innerHTML = history.map(h => `
    <div class="history-item">
      <span class="h-time">${h.time}</span>
      <span class="h-account">${h.account}</span>
      <span class="h-device">${h.device}</span>
      <span class="h-status">${h.success ? '✅' : '❌'}</span>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
//  Load state (đọc thẳng từ storage — reliable)
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  Admin Whitelist
// ─────────────────────────────────────────────

function renderWhitelist(list) {
  const el = document.getElementById('whitelistItems');
  if (!list.length) {
    el.innerHTML = '<div class="wl-empty">Chưa có fb_id nào trong whitelist</div>';
    return;
  }
  el.innerHTML = list.map(id => `
    <div class="wl-item">
      <span class="wl-id">${id}</span>
      <button class="btn-wl-del" data-id="${id}" title="Xoá">✕</button>
    </div>`).join('');

  el.querySelectorAll('.btn-wl-del').forEach(btn => {
    btn.addEventListener('click', () => removeFromWhitelist(btn.dataset.id));
  });
}

function addToWhitelist(fbId) {
  chrome.storage.local.get('pos_whitelist', ({ pos_whitelist = [] }) => {
    if (pos_whitelist.includes(fbId)) {
      showToast('⚠️ fb_id này đã có rồi!');
      return;
    }
    pos_whitelist.push(fbId);
    chrome.storage.local.set({ pos_whitelist }, () => {
      showToast('✅ Đã thêm: ' + fbId);
      renderWhitelist(pos_whitelist);
    });
  });
}

function removeFromWhitelist(fbId) {
  chrome.storage.local.get('pos_whitelist', ({ pos_whitelist = [] }) => {
    const updated = pos_whitelist.filter(id => id !== fbId);
    chrome.storage.local.set({ pos_whitelist: updated }, () => {
      showToast('🗑️ Đã xoá: ' + fbId);
      renderWhitelist(updated);
    });
  });
}

document.getElementById('btnWlAdd').addEventListener('click', () => {
  const val = document.getElementById('wlInput').value.trim();
  if (!val) { showToast('⚠️ Nhập fb_id trước!'); return; }
  addToWhitelist(val);
  document.getElementById('wlInput').value = '';
});

document.getElementById('wlInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btnWlAdd').click();
});

// ─────────────────────────────────────────────
//  Load state (đọc thẳng từ storage — reliable)
// ─────────────────────────────────────────────

function loadState() {
  chrome.storage.local.get([
    'device_name',
    'device_uuid',
    'current_account',
    'current_token_exp',
    'last_captured_account',
    'last_captured_exp',
    'last_sent_time',
    'last_sent_status',
    'token_valid',
    'history',
    'is_admin',
    'pos_whitelist'
  ], (state) => {
    // Fill device name input
    if (state.device_name) {
      document.getElementById('deviceName').value = state.device_name;
    }
    // Hiện Admin Panel nếu là admin
    if (state.is_admin) {
      document.getElementById('adminSection').style.display = 'block';
      renderWhitelist(state.pos_whitelist || []);
    }
    renderStatus(state);
  });
}

// ─────────────────────────────────────────────
//  Events
// ─────────────────────────────────────────────

// Lưu tên thiết bị
document.getElementById('btnSave').addEventListener('click', () => {
  const name = document.getElementById('deviceName').value.trim();
  if (!name) {
    showToast('⚠️ Vui lòng nhập tên thiết bị!');
    return;
  }
  chrome.storage.local.set({ device_name: name }, () => {
    showToast('✅ Đã lưu: ' + name);
  });
});

document.getElementById('deviceName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btnSave').click();
});

// Copy UUID
document.getElementById('btnCopyUUID').addEventListener('click', function() {
  const uuid = this.dataset.full;
  if (!uuid) return;
  navigator.clipboard.writeText(uuid).then(() => {
    showToast('📋 Đã copy Device UUID!');
  }).catch(() => {
    showToast('❌ Không copy được (thử lại)');
  });
});

// Gửi lại ngay
document.getElementById('btnSend').addEventListener('click', () => {
  const btn     = document.getElementById('btnSend');
  const btnIcon = document.getElementById('btnSendIcon');
  const btnText = document.getElementById('btnSendText');

  btn.disabled        = true;
  btnIcon.className   = 'spin';
  btnIcon.textContent = '⏳';
  btnText.textContent = 'Đang gửi...';

  const doSend = () => {
    chrome.runtime.sendMessage({ action: 'force_send' }, (res) => {
      // Khôi phục button
      btn.disabled        = false;
      btnIcon.className   = '';
      btnIcon.textContent = '🔄';
      btnText.textContent = 'Gửi lại ngay';

      if (chrome.runtime.lastError) {
        showToast('❌ Lỗi kết nối background!');
        return;
      }

      if (!res) {
        showToast('❌ Không có phản hồi từ background');
        return;
      }

      if (res.reason === 'no_token') {
        showToast('⚠️ Chưa bắt được token — vào pancake.vn/account trước!');
        return;
      }
      if (res.reason === 'invalid_token') {
        showToast('❌ Token không hợp lệ!');
        return;
      }

      if (res.ok) {
        showToast('✅ Gửi token thành công!');
      } else {
        showToast('❌ Webhook lỗi — kiểm tra lại URL!');
      }

      // Reload state sau khi gửi
      loadState();
    });
  };

  // Tự động lưu tên thiết bị từ input trước khi gửi
  const nameInput = document.getElementById('deviceName').value.trim();
  if (nameInput) {
    chrome.storage.local.set({ device_name: nameInput }, doSend);
  } else {
    doSend();
  }
});

// ─────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────
loadState();
