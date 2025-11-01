# คู่มือการติดตั้งและใช้งาน LINE OA Management System

## 📋 ข้อกำหนดของระบบ

### ซอฟต์แวร์ที่จำเป็น
- **Python**: เวอร์ชัน 3.8 ขึ้นไป
- **MongoDB Atlas**: บัญชีและ Cluster สำหรับฐานข้อมูล
- **LINE Developers Account**: สำหรับสร้าง LINE Official Account

### ความรู้พื้นฐานที่แนะนำ
- การใช้งาน Command Line พื้นฐาน
- การตั้งค่า MongoDB Atlas
- การตั้งค่า LINE Official Account

---

## 🚀 ขั้นตอนการติดตั้ง

### 1. ดาวน์โหลดโปรเจค

```bash
# ถ้าใช้ Git
git clone <repository-url>
cd line-oa-system

# หรือแตกไฟล์ ZIP
unzip line-oa-system.zip
cd line-oa-system
```

### 2. ติดตั้ง Dependencies

```bash
# ติดตั้ง Python packages
pip install -r requirements.txt

# หรือใช้ virtual environment (แนะนำ)
python3 -m venv venv
source venv/bin/activate  # บน Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. ตั้งค่า MongoDB Atlas

#### 3.1 สร้าง Cluster
1. เข้าสู่ [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. สร้าง Cluster ใหม่ (Free Tier ก็เพียงพอ)
3. รอจนกว่า Cluster จะพร้อมใช้งาน

#### 3.2 สร้าง Database User
1. ไปที่ **Database Access**
2. คลิก **Add New Database User**
3. ตั้งค่า:
   - Authentication Method: **Password**
   - Username: ตั้งชื่อผู้ใช้
   - Password: ตั้งรหัสผ่าน (บันทึกไว้)
   - Database User Privileges: **Atlas admin**
4. คลิก **Add User**

#### 3.3 ตั้งค่า Network Access
1. ไปที่ **Network Access**
2. คลิก **Add IP Address**
3. เลือก **Allow Access from Anywhere** (0.0.0.0/0)
4. คลิก **Confirm**

#### 3.4 รับ Connection String
1. กลับไปที่ **Database**
2. คลิกปุ่ม **Connect** ที่ Cluster ของคุณ
3. เลือก **Connect your application**
4. คัดลอก Connection String
5. แทนที่ `<password>` ด้วยรหัสผ่านจริง
6. แทนที่ `<dbname>` ด้วย `lineoa_system`

**ตัวอย่าง:**
```
mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/lineoa_system?retryWrites=true&w=majority
```

### 4. ตั้งค่าไฟล์ .env

```bash
# คัดลอกไฟล์ตัวอย่าง
cp .env.example .env

# แก้ไขไฟล์ .env
nano .env  # หรือใช้ text editor อื่นๆ
```

**แก้ไข MONGODB_URI:**
```env
MONGODB_URI=mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/lineoa_system?retryWrites=true&w=majority
MONGODB_DATABASE=lineoa_system
PORT=8000
```

### 5. รันโปรแกรม

#### วิธีที่ 1: ใช้ Script (แนะนำ)
```bash
./run.sh
```

#### วิธีที่ 2: รันด้วย Uvicorn โดยตรง
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### วิธีที่ 3: Production Mode
```bash
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

---

## 🔐 การเข้าสู่ระบบครั้งแรก

### ข้อมูล Admin เริ่มต้น
- **Username:** `admin`
- **Password:** `admin123`

### ขั้นตอน
1. เปิดเบราว์เซอร์ไปที่ `http://localhost:8000`
2. ใส่ Username และ Password
3. คลิก **เข้าสู่ระบบ**
4. ระบบจะบังคับให้เปลี่ยนรหัสผ่าน
5. ตั้งรหัสผ่านใหม่ที่มีความปลอดภัย

---

## 👥 การจัดการผู้ใช้

### สำหรับ Admin

#### สร้างผู้ใช้ใหม่
1. ไปที่ **จัดการผู้ใช้**
2. คลิก **เพิ่มผู้ใช้**
3. กรอกข้อมูล:
   - ชื่อผู้ใช้
   - รหัสผ่าน
   - ชื่อ-นามสกุล (ไม่บังคับ)
   - อีเมล (ไม่บังคับ)
   - บทบาท: **ผู้ใช้** หรือ **ผู้ดูแลระบบ**
4. คลิก **สร้างผู้ใช้**

#### ลบผู้ใช้
1. ไปที่ **จัดการผู้ใช้**
2. คลิกปุ่ม **ลบ** ที่ผู้ใช้ที่ต้องการ
3. ยืนยันการลบ

---

## 📱 การเพิ่มบัญชี LINE Official Account

### 1. เตรียมข้อมูล LINE OA

#### 1.1 เข้าสู่ LINE Developers Console
1. ไปที่ [LINE Developers Console](https://developers.line.biz/)
2. Login ด้วยบัญชี LINE ของคุณ

#### 1.2 สร้าง Provider (ถ้ายังไม่มี)
1. คลิก **Create a new provider**
2. ตั้งชื่อ Provider
3. คลิก **Create**

#### 1.3 สร้าง Messaging API Channel
1. เลือก Provider ที่สร้างไว้
2. คลิก **Create a new channel**
3. เลือก **Messaging API**
4. กรอกข้อมูล:
   - Channel name
   - Channel description
   - Category
   - Subcategory
5. ยอมรับ Terms of Use
6. คลิก **Create**

#### 1.4 รับข้อมูลสำคัญ

**Channel ID:**
1. ไปที่แท็บ **Basic settings**
2. คัดลอก **Channel ID**

**Channel Secret:**
1. ยังอยู่ที่แท็บ **Basic settings**
2. คัดลอก **Channel secret**

**Channel Access Token:**
1. ไปที่แท็บ **Messaging API**
2. เลื่อนลงไปที่ **Channel access token**
3. คลิก **Issue** (ถ้ายังไม่มี)
4. คัดลอก Token ที่ได้

#### 1.5 ตั้งค่า Webhook
1. ยังอยู่ที่แท็บ **Messaging API**
2. เลื่อนลงไปที่ **Webhook settings**
3. ตั้งค่า:
   - **Webhook URL:** `https://your-domain.com/webhook/{channel_id}`
   - **Use webhook:** เปิด
   - **Redelivery:** เปิด (ถ้าต้องการ)

### 2. เพิ่มบัญชีในระบบ

#### สำหรับ User
1. Login เข้าสู่ระบบ
2. ไปที่ **แดชบอร์ด**
3. คลิก **เพิ่มบัญชี LINE**
4. กรอกข้อมูล:
   - **ชื่อบัญชี:** ชื่อที่ใช้แสดงในระบบ
   - **Channel ID:** ที่คัดลอกมา
   - **Channel Secret:** ที่คัดลอกมา
   - **Channel Access Token:** ที่คัดลอกมา
   - **คำอธิบาย:** (ไม่บังคับ)
5. คลิก **เพิ่มบัญชี LINE**

---

## ⚙️ การตั้งค่าบัญชี LINE OA

### 1. เข้าสู่หน้าตั้งค่า
1. ไปที่ **บัญชี LINE OA ของฉัน**
2. คลิกปุ่ม **ตั้งค่า** ที่บัญชีที่ต้องการ

### 2. ตั้งค่า AI Chatbot

#### เปิดใช้งาน AI
1. เปิดสวิตช์ **เปิดใช้งาน AI Chatbot**
2. กรอก **OpenAI API Key**
   - รับได้จาก [OpenAI Platform](https://platform.openai.com/)
3. เลือก **โมเดล AI:**
   - GPT-4.1 Mini (แนะนำ)
   - GPT-4.1 Nano (เร็วกว่า ถูกกว่า)
   - Gemini 2.5 Flash
4. กรอก **บุคลิกภาพ AI:**
   - อธิบายว่าต้องการให้ AI มีบุคลิกภาพแบบไหน
   - ตัวอย่าง: "เป็นผู้ช่วยที่เป็นมิตร พูดสุภาพ และช่วยเหลือดี"

### 3. ตั้งค่าตรวจสอบสลิป

#### เปิดใช้งานตรวจสอบสลิป
1. เปิดสวิตช์ **เปิดใช้งานตรวจสอบสลิป**
2. เลือก **ผู้ให้บริการ API:**
   - Thunder API
   - SlipOK
3. กรอก **API Key** ของผู้ให้บริการที่เลือก

### 4. บันทึกการตั้งค่า
- คลิก **บันทึกการตั้งค่า**

---

## 🎯 การใช้งานระบบ

### สำหรับ Admin

#### ดูภาพรวมระบบ
- ไปที่ **แดชบอร์ด**
- ดูจำนวนผู้ใช้ทั้งหมด
- ดูจำนวนบัญชี LINE OA ทั้งหมด
- ดูรายการผู้ใช้และบัญชีล่าสุด

#### จัดการผู้ใช้
- **เพิ่มผู้ใช้:** สร้างบัญชีผู้ใช้ใหม่
- **ลบผู้ใช้:** ลบบัญชีผู้ใช้ที่ไม่ต้องการ
- **ดูรายละเอียด:** ดูข้อมูลผู้ใช้ทั้งหมด

#### ดูบัญชี LINE OA ทั้งหมด
- ไปที่ **บัญชี LINE OA**
- ดูบัญชีทั้งหมดในระบบ
- ดูเจ้าของแต่ละบัญชี

### สำหรับ User

#### จัดการบัญชี LINE OA
- **เพิ่มบัญชี:** เพิ่มบัญชี LINE OA ใหม่
- **ตั้งค่าบัญชี:** ตั้งค่า AI และ Slip Verification
- **ดูรายละเอียด:** ดูข้อมูลและสถิติบัญชี

#### เปลี่ยนรหัสผ่าน
- ไปที่ **เปลี่ยนรหัสผ่าน**
- กรอกรหัสผ่านปัจจุบัน
- กรอกรหัสผ่านใหม่
- ยืนยันรหัสผ่านใหม่

---

## 🔧 การแก้ปัญหา

### ปัญหา: ไม่สามารถเชื่อมต่อ MongoDB

**สาเหตุที่เป็นไปได้:**
1. Connection String ไม่ถูกต้อง
2. IP Address ไม่ได้รับอนุญาต
3. Username/Password ผิด

**วิธีแก้:**
1. ตรวจสอบ `.env` ว่า `MONGODB_URI` ถูกต้อง
2. ตรวจสอบ Network Access ใน MongoDB Atlas
3. ตรวจสอบ Database User ว่ามีสิทธิ์เพียงพอ

### ปัญหา: Login ไม่ได้

**วิธีแก้:**
1. ตรวจสอบว่าใช้ข้อมูล Admin เริ่มต้นถูกต้อง
2. ตรวจสอบว่าฐานข้อมูลเชื่อมต่อสำเร็จ
3. ลองรีสตาร์ทโปรแกรม

### ปัญหา: AI Chatbot ไม่ทำงาน

**วิธีแก้:**
1. ตรวจสอบว่า OpenAI API Key ถูกต้อง
2. ตรวจสอบว่าเปิดใช้งาน AI แล้ว
3. ตรวจสอบ Webhook URL ใน LINE Developers

### ปัญหา: ตรวจสอบสลิปไม่ได้

**วิธีแก้:**
1. ตรวจสอบว่า Slip API Key ถูกต้อง
2. ตรวจสอบว่าเปิดใช้งานตรวจสอบสลิปแล้ว
3. ตรวจสอบว่าผู้ให้บริการ API ยังใช้งานได้

---

## 📊 โครงสร้างฐานข้อมูล

### Collections

#### users
```javascript
{
  username: String (unique),
  password: String (hashed),
  role: String (admin/user),
  email: String,
  full_name: String,
  force_password_change: Boolean,
  is_active: Boolean,
  created_at: Date,
  updated_at: Date,
  last_login: Date
}
```

#### sessions
```javascript
{
  session_id: String (unique),
  user_id: String,
  username: String,
  role: String,
  created_at: Date,
  expires_at: Date (TTL index),
  last_activity: Date
}
```

#### line_accounts
```javascript
{
  account_name: String,
  channel_id: String (unique),
  channel_secret: String,
  channel_access_token: String,
  owner_id: String,
  description: String,
  settings: {
    ai_enabled: Boolean,
    ai_api_key: String,
    ai_model: String,
    ai_personality: String,
    slip_verification_enabled: Boolean,
    slip_api_provider: String,
    slip_api_key: String
  },
  is_active: Boolean,
  created_at: Date,
  updated_at: Date,
  statistics: {
    total_messages: Number,
    total_users: Number,
    total_slips_verified: Number
  }
}
```

---

## 🔒 ความปลอดภัย

### Best Practices
1. **เปลี่ยนรหัสผ่าน Admin:** เปลี่ยนทันทีหลัง Login ครั้งแรก
2. **ใช้รหัสผ่านที่แข็งแรง:** อย่างน้อย 8 ตัวอักษร ผสมตัวเลขและสัญลักษณ์
3. **ไม่แชร์ API Keys:** เก็บ API Keys เป็นความลับ
4. **อัปเดตเป็นประจำ:** ติดตามและอัปเดต dependencies
5. **Backup ฐานข้อมูล:** สำรองข้อมูลเป็นประจำ

### การรักษาความปลอดภัย
- รหัสผ่านเข้ารหัสด้วย bcrypt
- Session จัดการด้วย MongoDB TTL
- HTTP-only Cookies
- Role-based Access Control

---

## 📞 การติดต่อและสนับสนุน

### ปัญหาและคำถาม
- สร้าง Issue ใน GitHub Repository
- ติดต่อทีมพัฒนา

### เอกสารเพิ่มเติม
- [README.md](README.md) - ภาพรวมโปรเจค
- [API Documentation](API.md) - เอกสาร API
- [LINE Messaging API Docs](https://developers.line.biz/en/docs/messaging-api/)

---

## 📝 License

MIT License - ดูรายละเอียดใน LICENSE file

---

**สร้างโดย:** Manus AI  
**เวอร์ชัน:** 2.0.0  
**อัปเดตล่าสุด:** 2025

