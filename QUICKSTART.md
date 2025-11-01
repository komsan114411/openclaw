# 🚀 Quick Start Guide - LINE OA Management System

เริ่มต้นใช้งานระบบภายใน 5 นาที!

---

## ⚡ เริ่มต้นอย่างรวดเร็ว

### ขั้นตอนที่ 1: ติดตั้ง Dependencies (1 นาที)

```bash
# แตกไฟล์และเข้าโฟลเดอร์
cd line-oa-system

# ติดตั้ง packages
pip install -r requirements.txt
```

### ขั้นตอนที่ 2: ตั้งค่า MongoDB (2 นาที)

1. เข้า [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. สร้าง Cluster (Free Tier)
3. สร้าง Database User
4. Allow Access from Anywhere (0.0.0.0/0)
5. คัดลอก Connection String

### ขั้นตอนที่ 3: ตั้งค่า Environment (30 วินาที)

```bash
# คัดลอกไฟล์ตัวอย่าง
cp .env.example .env

# แก้ไข .env
nano .env
```

**แก้ไข MONGODB_URI:**
```env
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/lineoa_system
```

### ขั้นตอนที่ 4: รันโปรแกรม (30 วินาที)

```bash
# รันด้วย script
./run.sh

# หรือรันด้วย uvicorn
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### ขั้นตอนที่ 5: Login (1 นาที)

1. เปิดเบราว์เซอร์: `http://localhost:8000`
2. Login:
   - Username: `admin`
   - Password: `admin123`
3. เปลี่ยนรหัสผ่าน (บังคับ)

---

## 🎯 การใช้งานพื้นฐาน

### สำหรับ Admin

**สร้างผู้ใช้:**
1. ไปที่ **จัดการผู้ใช้**
2. คลิก **เพิ่มผู้ใช้**
3. กรอกข้อมูลและบทบาท
4. คลิก **สร้างผู้ใช้**

### สำหรับ User

**เพิ่มบัญชี LINE:**
1. ไปที่ **แดชบอร์ด**
2. คลิก **เพิ่มบัญชี LINE**
3. กรอก Channel ID, Secret, Token
4. คลิก **เพิ่มบัญชี LINE**

**ตั้งค่า AI:**
1. คลิก **ตั้งค่า** ที่บัญชี
2. เปิดใช้งาน AI Chatbot
3. กรอก OpenAI API Key
4. เลือกโมเดล
5. คลิก **บันทึกการตั้งค่า**

---

## 📱 รับข้อมูล LINE OA

### ข้อมูลที่ต้องการ:
- **Channel ID**
- **Channel Secret**
- **Channel Access Token**

### วิธีรับ:
1. เข้า [LINE Developers](https://developers.line.biz/)
2. เลือก Channel
3. **Basic settings** → คัดลอก Channel ID และ Secret
4. **Messaging API** → Issue และคัดลอก Access Token

---

## 🔑 ข้อมูล Login เริ่มต้น

| บทบาท | Username | Password |
|--------|----------|----------|
| Admin  | admin    | admin123 |

⚠️ **สำคัญ:** เปลี่ยนรหัสผ่านทันทีหลัง Login ครั้งแรก!

---

## 🛠️ คำสั่งที่ใช้บ่อย

```bash
# รันโปรแกรม (Development)
uvicorn main:app --reload

# รันโปรแกรม (Production)
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker

# ตรวจสอบ Dependencies
pip list

# อัปเดต Dependencies
pip install -r requirements.txt --upgrade
```

---

## ❓ แก้ปัญหาเร็ว

### ❌ ไม่สามารถเชื่อมต่อ MongoDB
```bash
# ตรวจสอบ Connection String
cat .env | grep MONGODB_URI

# ทดสอบการเชื่อมต่อ
python3 -c "from models.database import get_database; print(get_database().test_connection())"
```

### ❌ Login ไม่ได้
1. ตรวจสอบว่า MongoDB เชื่อมต่อสำเร็จ
2. รีสตาร์ทโปรแกรม
3. ลองใช้ข้อมูล Admin เริ่มต้น

### ❌ Port 8000 ถูกใช้งานแล้ว
```bash
# เปลี่ยน Port
uvicorn main:app --port 8080

# หรือหา Process ที่ใช้ Port
lsof -i :8000
kill -9 <PID>
```

---

## 📚 เอกสารเพิ่มเติม

- **[README.md](README.md)** - ภาพรวมโปรเจค
- **[INSTALLATION.md](INSTALLATION.md)** - คู่มือติดตั้งแบบละเอียด
- **[API Documentation](API.md)** - เอกสาร API (ถ้ามี)

---

## 💡 Tips

1. **ใช้ Virtual Environment** - แนะนำสำหรับ Development
2. **Backup ฐานข้อมูล** - สำรองข้อมูลเป็นประจำ
3. **อัปเดต Dependencies** - ตรวจสอบและอัปเดตเป็นประจำ
4. **ใช้ HTTPS** - สำหรับ Production
5. **Monitor Logs** - ตรวจสอบ logs เพื่อแก้ปัญหา

---

## 🎉 เริ่มต้นใช้งานได้แล้ว!

ตอนนี้คุณพร้อมใช้งานระบบแล้ว!

**Next Steps:**
1. สร้างผู้ใช้เพิ่มเติม
2. เพิ่มบัญชี LINE OA
3. ตั้งค่า AI Chatbot
4. ตั้งค่าตรวจสอบสลิป

**Happy Coding! 🚀**

---

**เวอร์ชัน:** 2.0.0  
**สร้างโดย:** Manus AI

