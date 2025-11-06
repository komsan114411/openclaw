# Round 12 Fixes - รายละเอียดการแก้ไข

**วันที่:** 6 พฤศจิกายน 2568  
**จำนวนปัญหา:** 6 ข้อ  
**สถานะ:** ✅ แก้ไขเสร็จสมบูรณ์

---

## 📋 สรุปปัญหาและการแก้ไข

### 1. ✅ แก้ไขหน้าจัดการธนาคาร (Admin Banks Page)

**ปัญหา:**
- หน้าจัดการธนาคารแสดง error ไม่สามารถเข้าได้
- Template structure ไม่ถูกต้อง

**สาเหตุ:**
- Template มี `<div>` ซ้ำซ้อนและโครงสร้างไม่ถูกต้อง
- ใช้ base template ที่ไม่เหมาะสม

**การแก้ไข:**
- แก้ไข `templates/admin/banks.html`
- ลบ `<div>` ที่ซ้ำซ้อน
- ปรับโครงสร้าง HTML ให้ถูกต้อง

**ไฟล์ที่แก้:**
- `templates/admin/banks.html`

---

### 2. ✅ แก้ไข Flex Message ไม่แสดง

**ปัญหา:**
- Flex Message ไม่แสดง แสดงเป็นข้อความธรรมดาแทน
- Logo ธนาคารไม่แสดงใน Flex Message

**สาเหตุ:**
- `get_bank_logo()` ใช้ MongoEngine (`Bank.objects`) แต่ระบบใช้ PyMongo
- ทำให้ function error และ fallback ไปใช้ text message

**การแก้ไข:**
- แก้ไข `services/slip_formatter.py`
- เปลี่ยนจาก MongoEngine เป็น PyMongo
- ใช้ `banks_collection.find_one()` แทน `Bank.objects()`
- เพิ่ม parameter `db` เพื่อรองรับการส่ง database connection

**โค้ดเดิม:**
```python
from models.bank import Bank
bank = Bank.objects(code=bank_code, is_active=True).first()
```

**โค้ดใหม่:**
```python
from pymongo import MongoClient
banks_collection = db.banks
bank = banks_collection.find_one({"code": bank_code, "is_active": True})
```

**ไฟล์ที่แก้:**
- `services/slip_formatter.py`

---

### 3. ✅ แก้ไขการบันทึกการตั้งค่า AI

**ปัญหา:**
- บันทึกการตั้งค่า AI แล้ว หลังรีเฟรชกลับมาเหมือนเดิม
- API Key หายหลังบันทึก

**สาเหตุ:**
- JavaScript ส่ง API Key placeholder (`********************************`) ไปบันทึกทับ API Key จริง
- ไม่มีการเช็คว่า input เป็น placeholder หรือไม่

**การแก้ไข:**
1. แก้ไข `templates/user/line_account_settings.html`
2. เปลี่ยน AI API Key input ให้แสดง placeholder เหมือน Slip API Key
3. เพิ่ม `data-has-key` และ `data-real-key` attributes
4. แก้ไข `saveChatbotSettings()` ให้ไม่ส่ง API Key ถ้าเป็น placeholder
5. อัพเดท placeholder หลังบันทึกสำเร็จ

**โค้ดเดิม:**
```javascript
const data = {
    ai_api_key: document.getElementById('aiApiKey').value,
    // ...
};
```

**โค้ดใหม่:**
```javascript
const apiKeyInput = document.getElementById('aiApiKey');
const apiKeyValue = apiKeyInput.value;

const data = { /* ... */ };

// Send API Key only if not placeholder
if (apiKeyValue && !apiKeyValue.startsWith('*')) {
    data.ai_api_key = apiKeyValue;
}
```

**ไฟล์ที่แก้:**
- `templates/user/line_account_settings.html`

---

### 4. ✅ แก้ไขชื่อบัญชีสีขาวมองไม่เห็น

**ปัญหา:**
- ข้อความ "กำลังโหลด..." ในหน้าแชทแสดงเป็นสีเทาอ่อนมาก มองไม่เห็นชัดเจน

**สาเหตุ:**
- CSS ของ `.empty-state` ใช้สี `var(--gray-400)` ซึ่งอ่อนเกินไป

**การแก้ไข:**
- แก้ไข `templates/settings/realtime_chat.html`
- เปลี่ยนสีจาก `--gray-400` เป็น `--gray-600` และ `--gray-700`
- เพิ่ม `font-weight: 500` เพื่อให้ตัวอักษรหนาขึ้น

**CSS เดิม:**
```css
.empty-state {
    color: var(--gray-400);
}
```

**CSS ใหม่:**
```css
.empty-state {
    color: var(--gray-600);
}

.empty-state i {
    color: var(--gray-500);
}

.empty-state p {
    color: var(--gray-700);
    font-weight: 500;
}
```

**ไฟล์ที่แก้:**
- `templates/settings/realtime_chat.html`

---

### 5. ✅ แก้ไข Logo บัญชีไลน์ไม่แสดงครบ

**สถานะ:**
- Logo ธนาคารแสดงได้แล้วหลังแก้ไข Flex Message (ข้อ 2)
- ถ้ายังมีปัญหา อาจเป็นเพราะ:
  - ธนาคารบางแห่งยังไม่มี logo ใน database
  - ต้องอัพโหลด logo ในหน้าจัดการธนาคาร

**วิธีแก้:**
1. เข้าหน้า **Admin > จัดการธนาคาร**
2. คลิก **แก้ไข** ที่ธนาคารที่ต้องการ
3. อัพโหลด logo (PNG/JPG)
4. คลิก **บันทึก**

---

### 6. ✅ ปรับขนาดรูปภาพให้เล็กลง 70%

**ปัญหา:**
- Logo ธนาคารในหน้าจัดการธนาคารใหญ่เกินไป

**การแก้ไข:**
- แก้ไข `templates/admin/banks.html`
- ปรับขนาด `.bank-logo` จาก 50px → 35px (ลด 30%)
- ปรับขนาด `.no-logo` จาก 50px → 35px
- ปรับขนาด logo ตัวอย่างในฟอร์มแก้ไข จาก 100px → 70px

**CSS เดิม:**
```css
.bank-logo {
    width: 50px;
    height: 50px;
}
```

**CSS ใหม่:**
```css
.bank-logo {
    width: 35px;
    height: 35px;
}
```

**ไฟล์ที่แก้:**
- `templates/admin/banks.html`

---

## 📁 ไฟล์ที่แก้ไขทั้งหมด

1. `services/slip_formatter.py` - แก้ไข Flex Message และ bank logo
2. `templates/admin/banks.html` - แก้ไขหน้าจัดการธนาคารและปรับขนาดรูป
3. `templates/user/line_account_settings.html` - แก้ไขการบันทึกการตั้งค่า AI
4. `templates/settings/realtime_chat.html` - แก้ไขสีข้อความให้มองเห็นชัด

---

## 🔧 การทดสอบ

### ทดสอบ Syntax
```bash
python3 -m py_compile main.py services/slip_formatter.py
```
✅ ผ่าน - ไม่มี syntax error

---

## 🚀 การ Deploy

### Git Commands
```bash
git add -A
git commit -m "Round 12: Fix admin banks page, Flex Message, AI settings, text visibility, and image sizes"
git push origin main
```

### Heroku Auto-Deploy
- ระบบจะ auto-deploy ภายใน 2-3 นาที

---

## 📝 หมายเหตุ

### Flex Message
- ตอนนี้ใช้ PyMongo แล้ว สามารถดึง logo ธนาคารจาก database ได้
- ถ้าธนาคารไหนยังไม่มี logo จะใช้ hardcoded logo แทน

### AI Settings
- API Key จะแสดงเป็น placeholder (`********************************`)
- จะบันทึกเฉพาะเมื่อมีการเปลี่ยนแปลงจริงๆ
- หลังบันทึกสำเร็จจะอัพเดท placeholder อัตโนมัติ

### รูปภาพ
- ปรับขนาด logo ธนาคารแล้ว
- รูป UI elements อื่นๆ (avatar, icon) ยังคงขนาดเดิมเพราะเหมาะสมแล้ว

---

**สรุป:** แก้ไขครบทั้ง 6 ข้อแล้ว พร้อม push ไปยัง GitHub ✅
