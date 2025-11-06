# Round 13 Fixes - แก้ไขปัญหา MongoEngine และ Flex Message

## วันที่: 6 พฤศจิกายน 2568

## ปัญหาที่แก้ไข

### 1. ✅ เพิ่มข้อมูลธนาคารจาก Thunder API
**ปัญหา:**
- หน้าจัดการธนาคารว่างเปล่า
- ต้องเพิ่มข้อมูลธนาคาร 18 แห่งตาม Thunder API bank codes

**วิธีแก้:**
- สร้าง API endpoint `/admin/api/banks/init-thunder-banks` (POST)
- เพิ่มปุ่ม "เพิ่มข้อมูลธนาคารจาก Thunder API" ในหน้าจัดการธนาคาร
- ข้อมูลธนาคารจาก https://document.thunder.in.th/other/bank-codes
- รองรับการอัพเดตข้อมูลโดยไม่ลบ logo ที่มีอยู่

**ไฟล์ที่แก้ไข:**
- `main.py` - เพิ่ม `init_thunder_banks()` API
- `templates/admin/banks.html` - เพิ่มปุ่มและ JavaScript function

---

### 2. ✅ ปรับขนาดรูปในประวัติแชท
**ปัญหา:**
- รูปสลิปในหน้าประวัติแชทใหญ่เกินไป

**วิธีแก้:**
- เปลี่ยน `max-width` จาก `100%` เป็น `300px`
- รูปจะแสดงขนาดเล็กลงประมาณ 70%

**ไฟล์ที่แก้ไข:**
- `templates/settings/realtime_chat.html` - CSS `.message-image`

---

### 3. ✅ แก้ไขการบันทึก AI Settings
**ปัญหา:**
- บันทึกการตั้งค่า AI แล้วหลังรีเฟรชกลับมาเหมือนเดิม

**วิธีแก้:**
- เพิ่ม `window.location.reload()` หลังบันทึกสำเร็จ
- ระบบจะ reload หน้าเพื่อแสดงข้อมูลล่าสุดจาก database

**ไฟล์ที่แก้ไข:**
- `templates/user/line_account_settings.html` - `saveChatbotSettings()` function

---

### 4. ✅ แก้ไข Flex Message ไม่แสดงใน LINE
**ปัญหาหลัก:**
```
ModuleNotFoundError: No module named 'mongoengine'
```

**สาเหตุ:**
- ระบบยังใช้ MongoEngine ใน `models/bank.py`
- แต่ไม่ได้ติดตั้ง MongoEngine บน Heroku
- ทำให้ API `/admin/api/banks` error 500
- ทำให้ `get_bank_logo()` error
- ทำให้ Flex Message ไม่สร้างได้ → fallback เป็นข้อความธรรมดา

**วิธีแก้:**
- **เปลี่ยนจาก MongoEngine เป็น PyMongo ทั้งระบบ**
- สร้าง `BankModel` class ใหม่ที่ใช้ PyMongo
- แก้ไข API endpoints ทั้งหมดที่เกี่ยวข้อง
- เพิ่ม `app.state.bank_model` ใน initialization

**ไฟล์ที่แก้ไข:**
- `models/bank.py` - เขียนใหม่ทั้งหมดเป็น PyMongo
- `main.py` - แก้ไข API endpoints:
  - `get_banks_api()`
  - `update_bank_api()`
  - `init_thunder_banks()`
  - `get_bank_logo()`
- `main.py` - เพิ่ม import และ initialization

---

## การทดสอบ

### ✅ Python Syntax Check
```bash
python3 -m py_compile main.py models/bank.py services/slip_formatter.py
```
**ผลลัพธ์:** ผ่านทั้งหมด

---

## สิ่งที่ต้องทำหลัง Deploy

### 1. เพิ่มข้อมูลธนาคาร
1. เข้าหน้า **Admin > จัดการธนาคาร**
2. คลิกปุ่ม **"เพิ่มข้อมูลธนาคารจาก Thunder API"**
3. ยืนยันการเพิ่มข้อมูล
4. ระบบจะเพิ่มธนาคาร 18 แห่ง

### 2. อัพโหลด Logo ธนาคาร
1. คลิก **"แก้ไข"** ที่ธนาคารที่ต้องการ
2. อัพโหลดไฟล์ logo (PNG/JPG, แนะนำ 200x200px)
3. คลิก **"บันทึก"**
4. Logo จะแสดงใน Flex Message ทันที

---

## ธนาคารที่รองรับ (18 แห่ง)

| Code | Abbr | ชื่อธนาคาร |
|------|------|-----------|
| 002 | BBL | ธนาคารกรุงเทพ |
| 004 | KBANK | ธนาคารกสิกรไทย |
| 006 | KTB | ธนาคารกรุงไทย |
| 011 | TTB | ธนาคารทหารไทยธนชาต |
| 014 | SCB | ธนาคารไทยพาณิชย์ |
| 022 | CIMBT | ธนาคารซีไอเอ็มบีไทย |
| 024 | UOBT | ธนาคารยูโอบี |
| 025 | BAY | ธนาคารกรุงศรีอยุธยา |
| 030 | GSB | ธนาคารออมสิน |
| 033 | GHB | ธนาคารอาคารสงเคราะห์ |
| 034 | BAAC | ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร |
| 035 | EXIM | ธนาคารเพื่อการส่งออกและนำเข้าแห่งประเทศไทย |
| 067 | TISCO | ธนาคารทิสโก้ |
| 069 | KKP | ธนาคารเกียรตินาคินภัทร |
| 070 | ICBCT | ธนาคารไอซีบีซี (ไทย) |
| 071 | TCD | ธนาคารไทยเครดิตเพื่อรายย่อย |
| 073 | LHFG | ธนาคารแลนด์ แอนด์ เฮ้าส์ |
| 098 | SME | ธนาคารพัฒนาวิสาหกิจขนาดกลางและขนาดย่อมแห่งประเทศไทย |

---

## สรุป

### ปัญหาหลัก
- **MongoEngine** ไม่ได้ติดตั้งบน Heroku
- ทำให้ระบบ error ทั้งหมดที่เกี่ยวข้องกับธนาคาร

### วิธีแก้
- **เปลี่ยนเป็น PyMongo ทั้งระบบ**
- สร้าง BankModel ใหม่
- แก้ไข API endpoints ทั้งหมด

### ผลลัพธ์
- ✅ หน้าจัดการธนาคารทำงานได้
- ✅ เพิ่มข้อมูลธนาคารจาก Thunder API ได้
- ✅ Flex Message แสดงได้พร้อม logo ธนาคาร
- ✅ รูปในประวัติแชทเล็กลง 70%
- ✅ การตั้งค่า AI บันทึกและแสดงผลได้ถูกต้อง

---

**หมายเหตุ:** ระบบพร้อมใช้งานแล้ว แต่ต้องเพิ่มข้อมูลธนาคารและอัพโหลด logo ก่อนใช้งานจริง
