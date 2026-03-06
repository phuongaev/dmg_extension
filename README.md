# 🥞 Pancake Token Watcher — Chrome Extension

## Cấu trúc file
```
pancake-token-watcher/
├── manifest.json     ← Khai báo extension (MV3)
├── background.js     ← Service Worker: bắt token, gửi webhook
├── popup.html        ← Giao diện popup
├── popup.js          ← Logic UI
└── README.md
```

---

## ⚙️ BƯỚC 1 — Điền Webhook URL vào background.js

Mở file `background.js`, tìm 2 dòng đầu và thay thế:

```js
const WEBHOOK_URL      = 'YOUR_WEBHOOK_URL_HERE';
const STATUS_CHECK_URL = 'YOUR_STATUS_CHECK_URL_HERE';
```

Ví dụ:
```js
const WEBHOOK_URL      = 'https://n8n.yourserver.com/webhook/pancake-token';
const STATUS_CHECK_URL = 'https://n8n.yourserver.com/webhook/check-token';
```

### Payload extension gửi về Webhook (POST JSON):
```json
{
  "token":        "eyJ...",
  "account_name": "Dung Thúy",
  "device_name":  "Laptop Văn Phòng",
  "device_uuid":  "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "status":       "active",
  "type":         "chat",
  "is_admin":     0,
  "automation":   1,
  "token_exp":    1780449617,
  "sent_at":      "2025-03-06T10:00:00.000Z"
}
```

### Status Check URL phải trả về:
```json
{ "valid": true }   ← token còn sống
{ "valid": false }  ← token chết → extension tự gửi token mới
```

---

## 🛠️ BƯỚC 2 — Cài đặt Extension vào Chrome

1. Mở Chrome → vào địa chỉ: `chrome://extensions/`
2. Bật **"Developer mode"** (góc trên phải)
3. Nhấn **"Load unpacked"**
4. Chọn thư mục `pancake-token-watcher`
5. Extension xuất hiện trên thanh công cụ ✅

---

## 🚀 BƯỚC 3 — Sử dụng

### Lần đầu sử dụng:
1. Click vào icon 🥞 trên thanh Chrome
2. **Nhập tên thiết bị** (VD: "Laptop VP", "PC Kho") → nhấn **Lưu**
3. Mở tab mới → vào `https://pancake.vn/account`
4. Đăng nhập bình thường
5. Extension tự động bắt token và gửi về webhook
6. Popup hiển thị: Tài khoản, Token còn bao lâu, Lần gửi cuối ✅

### Hàng ngày:
- Không cần làm gì — extension tự chạy ngầm
- Token sẽ tự gửi lại mỗi **12 giờ** hoặc khi bắt được token mới
- Mỗi giờ extension check webhook xem token còn sống không

### Khi cần gửi thủ công:
- Click icon 🥞 → nhấn nút **"🔄 Gửi lại ngay"**

---

## 📋 Payload fields giải thích

| Field | Giá trị | Ý nghĩa |
|-------|---------|---------|
| token | eyJ... | JWT token |
| account_name | Dung Thúy | Tên từ JWT payload |
| device_name | Laptop VP | Tên tự đặt trong popup |
| device_uuid | uuid | ID cố định của máy (tự sinh) |
| status | active | Hardcode |
| type | chat | Hardcode |
| is_admin | 0 | Hardcode |
| automation | 1 | Hardcode |
| token_exp | unix timestamp | Thời điểm hết hạn |
| sent_at | ISO string | Thời điểm gửi |

---

## 🔧 Troubleshoot

| Vấn đề | Giải pháp |
|--------|-----------|
| Không bắt được token | Đảm bảo vào đúng `pancake.vn/account` (không phải trang khác) |
| Gửi thất bại ❌ | Kiểm tra WEBHOOK_URL có đúng không |
| Token "Chưa phát hiện" | Reload extension → vào lại pancake.vn/account |
| Extension không hiện | Bật Developer Mode → Load unpacked lại |

---

## 📞 Cập nhật code

Sau khi sửa `background.js` (đổi webhook URL):
1. Vào `chrome://extensions/`
2. Nhấn nút 🔄 (Reload) trên card extension
3. Extension cập nhật ngay, không cần xóa và cài lại
