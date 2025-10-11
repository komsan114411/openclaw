# LINE Official Account Middleware

ระบบ Middleware สำหรับจัดการ LINE Official Account พร้อมฟีเจอร์ครบครัน

## ฟีเจอร์หลัก

### 1. Multi-Account Support
- รองรับการจัดการหลาย LINE Official Account
- แยกข้อมูลและการตั้งค่าแต่ละบัญชี
- Dashboard สำหรับจัดการบัญชีต่างๆ

### 2. Chat History Management
- บันทึกประวัติการสนทนาทั้งหมด
- รองรับข้อความ รูปภาพ วิดีโอ และไฟล์
- ค้นหาและกรองประวัติได้

### 3. AI Chatbot
- ตอบกลับอัตโนมัติด้วย AI
- ปรับแต่งบุคลิกภาพของบอท
- รองรับ context-aware conversations

### 4. Slip Verification
- ตรวจสอบสลิปโอนเงินอัตโนมัติ
- รองรับหลาย API providers
- แสดงผลแบบ Flex Message สวยงาม

### 5. Admin Dashboard
- จัดการผู้ใช้และบัญชี
- ดูสถิติและรายงาน
- ตั้งค่าระบบแบบ real-time

## โครงสร้างโปรเจกต์

```
.
├── main.py                 # Entry point หลัก
├── config.py              # Configuration management
├── requirements.txt       # Python dependencies
├── Procfile              # Deployment configuration
├── models/               # Database models
│   ├── __init__.py
│   ├── database.py       # MongoDB operations
│   ├── line_account_manager.py
│   └── line_account_db.py
├── services/             # Business logic
│   ├── __init__.py
│   ├── chat_bot.py       # AI chatbot
│   ├── slip_checker.py   # Slip verification
│   ├── enhanced_slip_checker.py
│   └── slip_formatter.py # Flex message formatter
├── utils/                # Utilities
│   ├── __init__.py
│   ├── config_manager.py
│   └── mongodb_config.py
└── templates/            # HTML templates
    ├── admin_home.html
    ├── chat_history.html
    └── ...
```

## การติดตั้ง

### 1. Clone โปรเจกต์

```bash
git clone https://github.com/komsan114411/test.git
cd test
```

### 2. ติดตั้ง Dependencies

```bash
pip install -r requirements.txt
```

### 3. ตั้งค่า Environment Variables

สร้างไฟล์ `.env`:

```env
# MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
MONGODB_DBNAME=lineoa

# LINE Official Account (Default)
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token
LINE_CHANNEL_SECRET=your_channel_secret

# OpenAI (for AI Chatbot)
OPENAI_API_KEY=your_openai_api_key

# Slip Verification APIs
THUNDER_API_KEY=your_thunder_api_key
SLIP_OK_API_KEY=your_slipok_api_key

# Server
PORT=8000
```

### 4. รันแอปพลิเคชัน

**Development:**
```bash
python main.py
```

**Production (Heroku):**
```bash
git push heroku main
```

## API Endpoints

### Webhook
- `POST /line/webhook` - รับ events จาก LINE

### Admin
- `GET /admin` - Admin dashboard
- `GET /admin/accounts` - จัดการบัญชี LINE OA
- `GET /admin/chat-history` - ดูประวัติแชท
- `GET /admin/users` - จัดการผู้ใช้
- `GET /admin/config` - ตั้งค่าระบบ

### API
- `GET /health` - Health check
- `GET /api/stats` - สถิติระบบ
- `POST /api/broadcast` - ส่งข้อความ broadcast

## การใช้งาน

### 1. เพิ่ม LINE Official Account

1. เข้า Admin Dashboard: `http://localhost:8000/admin`
2. คลิก "เพิ่มบัญชี"
3. กรอก Channel Access Token และ Channel Secret
4. บันทึก

### 2. ตั้งค่า Webhook

1. เข้า LINE Developers Console
2. ตั้งค่า Webhook URL: `https://your-domain.com/line/webhook/{account_id}`
3. เปิดใช้งาน Webhook

### 3. ทดสอบระบบ

ส่งข้อความไปที่ LINE Official Account ของคุณ ระบบจะ:
- บันทึกข้อความลง database
- ตอบกลับด้วย AI (ถ้าเปิดใช้งาน)
- ตรวจสอบสลิป (ถ้าส่งรูปสลิป)

## การพัฒนา

### เพิ่มฟีเจอร์ใหม่

1. สร้างไฟล์ใน `services/` สำหรับ business logic
2. เพิ่ม route ใน `main.py`
3. อัปเดต `models/database.py` ถ้าต้องการ schema ใหม่

### การทดสอบ

```bash
# ทดสอบการเชื่อมต่อ database
curl http://localhost:8000/health

# ทดสอบ webhook (ใช้ LINE Messaging API Simulator)
```

## Troubleshooting

### Database ไม่เชื่อมต่อ
- ตรวจสอบ `MONGODB_URI` ใน environment variables
- ตรวจสอบ IP whitelist ใน MongoDB Atlas

### Webhook ไม่ทำงาน
- ตรวจสอบ URL ใน LINE Developers Console
- ตรวจสอบ Channel Secret ถูกต้อง
- ดู logs: `heroku logs --tail`

### AI ไม่ตอบกลับ
- ตรวจสอบ `OPENAI_API_KEY`
- ตรวจสอบ quota ของ OpenAI API

## License

MIT License

## ผู้พัฒนา

- GitHub: [@komsan114411](https://github.com/komsan114411)

## การสนับสนุน

หากพบปัญหาหรือมีข้อเสนอแนะ กรุณาสร้าง Issue ใน GitHub

