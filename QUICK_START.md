# 🚀 Quick Start Guide

## การติดตั้งและใช้งานอย่างรวดเร็ว

### 1. ติดตั้ง Dependencies (5 นาที)

```bash
# ติดตั้ง Python packages
pip install -r requirements.txt
```

### 2. ตั้งค่า Environment Variables (5 นาที)

```bash
# คัดลอกไฟล์ตัวอย่าง
cp .env.example .env

# แก้ไข .env ด้วย text editor
nano .env
```

**ค่าที่จำเป็นต้องตั้ง:**
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
LINE_CHANNEL_ACCESS_TOKEN=your_token_here
LINE_CHANNEL_SECRET=your_secret_here
```

**ค่าเสริม (optional):**
```env
OPENAI_API_KEY=sk-your_key_here          # สำหรับ AI Chatbot
THUNDER_API_KEY=your_key_here            # สำหรับตรวจสอบสลิป
```

### 3. รันแอปพลิเคชัน (1 นาที)

```bash
# รันในโหมด development
python main.py
```

เปิดเบราว์เซอร์:
- **Admin Dashboard:** http://localhost:8000/admin
- **Health Check:** http://localhost:8000/health
- **API Docs:** http://localhost:8000/docs

### 4. ตั้งค่า LINE Webhook (5 นาที)

1. เข้า [LINE Developers Console](https://developers.line.biz/)
2. เลือก Provider และ Channel ของคุณ
3. ไปที่ Messaging API settings
4. ตั้งค่า Webhook URL:
   ```
   https://your-domain.com/line/webhook
   ```
5. เปิดใช้งาน Webhook
6. ปิด Auto-reply messages (ถ้าต้องการ)

### 5. ทดสอบระบบ (2 นาที)

```bash
# ทดสอบ health check
curl http://localhost:8000/health

# ทดสอบ imports
python test_imports.py
```

ส่งข้อความไปที่ LINE Official Account ของคุณเพื่อทดสอบ!

## 🎯 การใช้งานฟีเจอร์หลัก

### เพิ่ม LINE Official Account

1. เข้า http://localhost:8000/admin
2. คลิก "เพิ่มบัญชี"
3. กรอก:
   - Display Name
   - Channel Access Token
   - Channel Secret
4. บันทึก

### ดูประวัติแชท

1. เข้า http://localhost:8000/admin/chat-history
2. เลือกบัญชีที่ต้องการ
3. กรอง/ค้นหาตามต้องการ

### ตั้งค่า AI Chatbot

1. เข้า http://localhost:8000/admin/config
2. เปิดใช้งาน AI Chatbot
3. ปรับแต่งบุคลิกภาพ (System Message)
4. บันทึก

### ตั้งค่า Slip Verification

1. เข้า http://localhost:8000/admin/config
2. เปิดใช้งาน Slip Verification
3. ใส่ API Keys (Thunder/SlipOK)
4. บันทึก

## 🚀 Deploy ไปยัง Heroku

### ขั้นตอนการ Deploy (10 นาที)

```bash
# 1. Login Heroku
heroku login

# 2. สร้าง app
heroku create your-app-name

# 3. ตั้งค่า environment variables
heroku config:set MONGODB_URI=your_mongodb_uri
heroku config:set LINE_CHANNEL_ACCESS_TOKEN=your_token
heroku config:set LINE_CHANNEL_SECRET=your_secret
heroku config:set OPENAI_API_KEY=your_openai_key

# 4. Deploy
git init
git add .
git commit -m "Initial deployment"
git push heroku main

# 5. เปิด app
heroku open
```

### ตรวจสอบ Logs

```bash
# ดู logs แบบ real-time
heroku logs --tail

# ดู logs ย้อนหลัง
heroku logs --tail -n 100
```

## 🔧 Troubleshooting

### Database ไม่เชื่อมต่อ

**ปัญหา:** `Database connection failed`

**แก้ไข:**
1. ตรวจสอบ `MONGODB_URI` ถูกต้อง
2. ตรวจสอบ IP whitelist ใน MongoDB Atlas
3. ตรวจสอบ username/password

### Webhook ไม่ทำงาน

**ปัญหา:** ไม่ได้รับข้อความจาก LINE

**แก้ไข:**
1. ตรวจสอบ Webhook URL ใน LINE Console
2. ตรวจสอบ Channel Secret ถูกต้อง
3. ดู logs: `heroku logs --tail`
4. ทดสอบด้วย LINE Messaging API Simulator

### AI ไม่ตอบกลับ

**ปัญหา:** AI Chatbot ไม่ทำงาน

**แก้ไข:**
1. ตรวจสอบ `OPENAI_API_KEY` ถูกต้อง
2. ตรวจสอบ quota ของ OpenAI
3. เปิดใช้งาน AI ใน Admin Config

### Slip Verification ไม่ทำงาน

**ปัญหา:** ไม่สามารถตรวจสอบสลิปได้

**แก้ไข:**
1. ตรวจสอบ API Keys (Thunder/SlipOK)
2. ตรวจสอบ quota ของ API
3. เปิดใช้งาน Slip Verification ใน Config

## 📚 เอกสารเพิ่มเติม

- **README.md** - คู่มือการใช้งานครบถ้วน
- **IMPROVEMENTS.md** - สรุปการปรับปรุงโดยละเอียด
- **CHANGELOG.md** - บันทึกการเปลี่ยนแปลง

## 💡 Tips

1. ใช้ MongoDB Atlas (Free Tier) สำหรับ development
2. ตั้งค่า IP whitelist เป็น `0.0.0.0/0` สำหรับ testing
3. ใช้ Heroku Free Tier สำหรับ testing
4. เปิด Debug mode ใน development: ดู logs ที่ `app.log`
5. ใช้ LINE Messaging API Simulator สำหรับทดสอบ webhook

## 🎓 Next Steps

1. ปรับแต่ง AI Chatbot personality
2. เพิ่ม LINE Official Account เพิ่มเติม
3. ตั้งค่า Auto-reply messages
4. สร้าง Rich Menu
5. เพิ่มฟีเจอร์ตามต้องการ

---

**ต้องการความช่วยเหลือ?** อ่าน README.md หรือดู source code ใน `main.py`
