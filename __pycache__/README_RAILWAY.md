# 🚂 Railway Deployment Guide - Updated

## ✅ การแก้ไขล่าสุด (2 พ.ย. 2025)

### ปัญหาที่พบ
- ✅ ระบบรันได้แล้ว แต่ Railway หยุดอัตโนมัติ (Stopping Container)
- ✅ PORT configuration ไม่ถูกต้อง

### การแก้ไข
- ✅ เพิ่มไฟล์ `Procfile` สำหรับ Railway
- ✅ เพิ่มไฟล์ `railway.json` สำหรับ configuration
- ✅ เพิ่มไฟล์ `runtime.txt` สำหรับระบุ Python version
- ✅ เพิ่มไฟล์ `.gitignore` เพื่อไม่ commit .env
- ✅ ลบไฟล์ .env ออกจาก git tracking

---

## 🚀 วิธี Deploy บน Railway (อัปเดต)

### ขั้นตอนที่ 1: ตั้งค่า Environment Variables

ไปที่ **Railway Dashboard** → **Project** → **Variables** และเพิ่ม:

```bash
# Required
MONGODB_URI=mongodb+srv://herokuai:1234Zaza@cluster0.z3s5j4s.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0

# Optional (มี default values)
MONGODB_DATABASE=lineoa_system
HOST=0.0.0.0
DEBUG=False
LOG_LEVEL=INFO
```

**⚠️ สำคัญ:** ไม่ต้องตั้งค่า `PORT` เพราะ Railway จะตั้งค่าให้อัตโนมัติ

### ขั้นตอนที่ 2: Deploy

Railway จะ deploy อัตโนมัติจาก GitHub เมื่อ push

```bash
git push origin main
```

### ขั้นตอนที่ 3: ตรวจสอบ Logs

```bash
railway logs
```

**ควรเห็น:**
```
✅ MongoDB connected successfully (database: lineoa_system)
✅ Database initialized
✅ Models initialized
✅ System ready!
INFO: Application startup complete.
INFO: Uvicorn running on http://0.0.0.0:XXXX
```

### ขั้นตอนที่ 4: เข้าถึงเว็บไซต์

Railway จะสร้าง domain ให้อัตโนมัติ:
```
https://your-project.railway.app
```

---

## 📁 ไฟล์ใหม่ที่เพิ่ม

### 1. `Procfile`
```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```
- บอก Railway ว่าจะรันคำสั่งอะไร
- ใช้ `$PORT` จาก Railway environment

### 2. `railway.json`
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "uvicorn main:app --host 0.0.0.0 --port $PORT",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```
- Configuration สำหรับ Railway
- ตั้งค่า restart policy

### 3. `runtime.txt`
```
python-3.11.0
```
- ระบุ Python version ที่ใช้

### 4. `.gitignore`
- ไม่ commit ไฟล์ที่ไม่จำเป็น
- ป้องกัน .env ถูก commit

---

## 🔧 สิ่งที่เปลี่ยนแปลง

### Before (เดิม)
```python
# main.py
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
```
- ใช้ port 8000 แบบ hardcode
- Railway ไม่สามารถเปลี่ยน port ได้

### After (ใหม่)
```python
# main.py
if __name__ == "__main__":
    uvicorn.run(app, host=settings.HOST, port=settings.PORT)
```

```python
# config/settings.py
PORT: int = int(os.getenv('PORT', 8000))
```

```
# Procfile
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```
- ใช้ `$PORT` จาก Railway environment
- Railway สามารถกำหนด port ได้

---

## ✅ Checklist สำหรับ Railway

### ก่อน Deploy
- [x] ✅ เพิ่มไฟล์ Procfile
- [x] ✅ เพิ่มไฟล์ railway.json
- [x] ✅ เพิ่มไฟล์ runtime.txt
- [x] ✅ เพิ่มไฟล์ .gitignore
- [x] ✅ ลบ .env ออกจาก git
- [x] ✅ Push ไปยัง GitHub

### หลัง Deploy (ต้องทำ)
- [ ] ⏳ ตั้งค่า `MONGODB_URI` บน Railway Dashboard
- [ ] ⏳ ตรวจสอบ Deployment Logs
- [ ] ⏳ ทดสอบเข้าถึงเว็บไซต์
- [ ] ⏳ Login ด้วย admin/admin123
- [ ] ⏳ เปลี่ยนรหัสผ่าน Admin

---

## 🐛 การแก้ปัญหา

### ปัญหา: Container หยุดอัตโนมัติ (Stopping Container)

**สาเหตุ:**
- ไม่มีไฟล์ Procfile หรือ railway.json
- PORT configuration ไม่ถูกต้อง

**วิธีแก้:**
- ✅ เพิ่มไฟล์ Procfile และ railway.json แล้ว
- ✅ ใช้ `$PORT` จาก Railway environment

### ปัญหา: Application startup failed

**สาเหตุ:**
- MONGODB_URI ไม่ได้ตั้งค่า

**วิธีแก้:**
1. ไปที่ Railway Dashboard → Variables
2. เพิ่ม `MONGODB_URI`
3. Redeploy

### ปัญหา: Module not found

**สาเหตุ:**
- Dependencies ไม่ครบ

**วิธีแก้:**
```bash
# ตรวจสอบ requirements.txt
cat requirements.txt
```

---

## 📊 สถิติการแก้ไข

| รายการ | จำนวน |
|--------|-------|
| **ไฟล์ที่เพิ่ม** | 4 ไฟล์ (Procfile, railway.json, runtime.txt, .gitignore) |
| **ไฟล์ที่แก้ไข** | 0 ไฟล์ (ไม่ต้องแก้โค้ด) |
| **การตั้งค่า** | ใช้ $PORT จาก Railway |

---

## 🎯 ทำไมต้องใช้ Procfile?

Railway ต้องการรู้ว่าจะรันแอปพลิเคชันอย่างไร:

**ไม่มี Procfile:**
- Railway ไม่รู้ว่าจะรันคำสั่งอะไร
- อาจใช้คำสั่งผิด
- Container หยุดอัตโนมัติ

**มี Procfile:**
- Railway รู้ว่าต้องรัน `uvicorn main:app`
- ใช้ PORT ที่ Railway กำหนด
- Container รันต่อเนื่อง

---

## 🎉 สรุป

### การแก้ไขล่าสุด
- ✅ เพิ่มไฟล์ Procfile สำหรับ Railway
- ✅ เพิ่มไฟล์ railway.json สำหรับ configuration
- ✅ เพิ่มไฟล์ runtime.txt สำหรับ Python version
- ✅ เพิ่มไฟล์ .gitignore
- ✅ ลบ .env ออกจาก git tracking

### สิ่งที่ต้องทำต่อ
1. ⏳ ตั้งค่า `MONGODB_URI` บน Railway Dashboard
2. ⏳ Deploy จะทำงานอัตโนมัติ
3. ⏳ ทดสอบการใช้งาน

**โปรเจคพร้อม Deploy บน Railway แล้ว! 🚀**

