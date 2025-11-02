# 🚂 Railway Deployment Guide

## ✅ การแก้ไขที่ทำแล้ว

### 1. แก้ไขปัญหา MONGODB_URI
- ✅ เพิ่ม `load_dotenv()` ใน `database.py` และ `main.py`
- ✅ สร้าง `config/settings.py` สำหรับจัดการ configuration
- ✅ อัปเดตโค้ดให้ใช้ `settings.MONGODB_URI` แทน `os.getenv()`

### 2. ปรับปรุงโครงสร้างโปรเจค
- ✅ สร้างโฟลเดอร์ `config/` สำหรับ configuration
- ✅ แยก settings ออกมาเป็น module ต่างหาก
- ✅ ใช้ centralized configuration

### 3. ทดสอบแล้ว
- ✅ Python imports: ผ่าน
- ✅ MongoDB connection: ผ่าน
- ✅ Settings loading: ผ่าน

---

## 🚀 วิธี Deploy บน Railway

### ขั้นตอนที่ 1: ตั้งค่า Environment Variables

เข้าไปที่ Railway Dashboard → Project → Variables และเพิ่ม:

```bash
MONGODB_URI=mongodb+srv://herokuai:1234Zaza@cluster0.z3s5j4s.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
MONGODB_DATABASE=lineoa_system
PORT=8000
HOST=0.0.0.0
```

### ขั้นตอนที่ 2: Deploy

Railway จะ deploy อัตโนมัติเมื่อ push ไปยัง GitHub

```bash
git push origin main
```

### ขั้นตอนที่ 3: ตรวจสอบ Logs

```bash
railway logs
```

### ขั้นตอนที่ 4: เข้าถึงเว็บไซต์

Railway จะสร้าง domain ให้อัตโนมัติ เช่น:
```
https://your-project.railway.app
```

---

## 🔧 การตั้งค่าเพิ่มเติม

### Environment Variables ที่สามารถตั้งค่าได้

```bash
# Required
MONGODB_URI=<your-mongodb-uri>

# Optional
MONGODB_DATABASE=lineoa_system
PORT=8000
HOST=0.0.0.0
DEBUG=False
LOG_LEVEL=INFO

# LINE Configuration (optional - can set from web interface)
LINE_CHANNEL_SECRET=<your-channel-secret>
LINE_CHANNEL_ACCESS_TOKEN=<your-channel-token>

# OpenAI (optional)
OPENAI_API_KEY=<your-openai-key>

# Slip Verification (optional)
SLIP_API_KEY=<your-slip-key>
SLIP_API_PROVIDER=thunder

# Security
SECRET_KEY=<your-secret-key>
SESSION_EXPIRE_HOURS=24
```

---

## 📊 การตรวจสอบสถานะ

### ตรวจสอบว่า Deploy สำเร็จ

1. เข้าไปที่ Railway Dashboard
2. ดู Deployment Logs
3. ตรวจสอบว่ามีข้อความ:
   ```
   ✅ MongoDB connected successfully
   🚀 Starting server on 0.0.0.0:8000
   ```

### ทดสอบ API

```bash
curl https://your-project.railway.app/api/status
```

---

## 🐛 การแก้ปัญหา

### ปัญหา: MONGODB_URI not set

**สาเหตุ:**
- ไม่ได้ตั้งค่า Environment Variable บน Railway

**วิธีแก้:**
1. ไปที่ Railway Dashboard → Variables
2. เพิ่ม `MONGODB_URI` พร้อมค่าที่ถูกต้อง
3. Redeploy

### ปัญหา: Import Error

**สาเหตุ:**
- Dependencies ไม่ครบ

**วิธีแก้:**
```bash
# ตรวจสอบ requirements.txt
cat requirements.txt

# ต้องมี python-dotenv
python-dotenv==1.0.0
```

### ปัญหา: MongoDB Connection Failed

**สาเหตุ:**
- MongoDB URI ไม่ถูกต้อง
- IP ไม่ได้รับอนุญาต

**วิธีแก้:**
1. ตรวจสอบ MongoDB URI
2. ไปที่ MongoDB Atlas → Network Access
3. เพิ่ม IP: `0.0.0.0/0` (Allow from anywhere)

---

## ✅ Checklist ก่อน Deploy

- [x] Push โค้ดล่าสุดไปยัง GitHub
- [x] ตั้งค่า `MONGODB_URI` บน Railway
- [ ] ตรวจสอบ Deployment Logs
- [ ] ทดสอบเข้าถึงเว็บไซต์
- [ ] Login ด้วย admin/admin123
- [ ] เปลี่ยนรหัสผ่าน Admin
- [ ] เพิ่มบัญชี LINE OA
- [ ] ตั้งค่า Webhook URL

---

## 🎉 สรุป

โปรเจคพร้อม Deploy บน Railway แล้ว!

**การเปลี่ยนแปลงหลัก:**
- ✅ แก้ไขปัญหา Environment Variables
- ✅ ปรับปรุงโครงสร้างโปรเจค
- ✅ เพิ่ม centralized configuration
- ✅ ทดสอบทุกอย่างสำเร็จ

**ขั้นตอนต่อไป:**
1. ตั้งค่า Environment Variables บน Railway
2. Deploy จะทำงานอัตโนมัติ
3. เข้าใช้งานผ่าน Railway domain

**ขอให้ Deploy สำเร็จครับ! 🚀**

