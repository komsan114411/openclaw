# LINE OA Management System

ระบบจัดการ LINE Official Account แบบ Multi-Account พร้อมระบบ Authentication แบบ Role-based (Admin/User)

## ✨ คุณสมบัติหลัก

### 🔐 ระบบ Authentication
- **Role-based Access Control** - แยกสิทธิ์ Admin และ User
- **Default Admin Account** - Username: `admin`, Password: `admin123`
- **Force Password Change** - บังคับเปลี่ยนรหัสผ่านครั้งแรก
- **Session Management** - จัดการ session ด้วย MongoDB TTL index

### 👥 การจัดการผู้ใช้
- **Admin Dashboard** - ดูข้อมูลทั้งหมดของระบบ
- **User Dashboard** - ดูเฉพาะข้อมูลของตัวเอง
- **User Management** - สร้าง/แก้ไข/ลบผู้ใช้ (Admin เท่านั้น)
- **Permission Control** - กำหนดสิทธิ์การเข้าถึงบัญชี LINE แต่ละบัญชี

### 📱 LINE Official Account
- **Multi-Account Support** - รองรับหลายบัญชี LINE OA
- **Account Settings** - ตั้งค่า AI, Slip Verification แยกแต่ละบัญชี
- **Chat History** - บันทึกประวัติการสนทนา
- **Statistics** - สถิติการใช้งานแต่ละบัญชี

### 🤖 AI Chatbot
- **OpenAI Integration** - ตอบกลับอัตโนมัติด้วย AI
- **Custom Personality** - ปรับแต่งบุคลิกภาพ AI
- **Per-Account Settings** - ตั้งค่า AI แยกแต่ละบัญชี

### 💰 Slip Verification
- **Auto Verification** - ตรวจสอบสลิปโอนเงินอัตโนมัติ
- **Multiple Providers** - รองรับหลาย API (Thunder, SlipOK)
- **Beautiful Flex Message** - แสดงผลสวยงาม

## 🚀 การติดตั้ง

### 1. Clone โปรเจค
```bash
git clone <repository-url>
cd line-oa-system
```

### 2. ติดตั้ง Dependencies
```bash
pip install -r requirements.txt
```

### 3. ตั้งค่า Environment Variables
```bash
cp .env.example .env
# แก้ไขไฟล์ .env ตามต้องการ
```

### 4. รันโปรแกรม
```bash
# Development
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

## 📋 การใช้งาน

### เข้าสู่ระบบครั้งแรก
1. เปิดเบราว์เซอร์ไปที่ `http://localhost:8000`
2. Login ด้วย:
   - Username: `admin`
   - Password: `admin123`
3. ระบบจะบังคับให้เปลี่ยนรหัสผ่าน

### สำหรับ Admin
- **Dashboard** - ดูภาพรวมทั้งระบบ
- **จัดการผู้ใช้** - สร้าง/แก้ไข/ลบผู้ใช้
- **จัดการบัญชี LINE** - ดูบัญชี LINE ทั้งหมด
- **ดูประวัติการสนทนา** - ดูทุกบัญชี

### สำหรับ User
- **Dashboard** - ดูบัญชี LINE ของตัวเอง
- **เพิ่มบัญชี LINE** - เพิ่มบัญชี LINE OA ใหม่
- **ตั้งค่าบัญชี** - ตั้งค่า AI, Slip API
- **ดูประวัติการสนทนา** - ดูเฉพาะบัญชีของตัวเอง

## 🗂️ โครงสร้างโปรเจค

```
line-oa-system/
├── main.py                 # FastAPI application
├── models/
│   ├── database.py        # MongoDB connection
│   ├── user.py           # User model
│   ├── session.py        # Session management
│   └── line_account.py   # LINE account model
├── middleware/
│   └── auth.py           # Authentication middleware
├── services/
│   ├── chat_bot.py       # AI chatbot service
│   ├── slip_checker.py   # Slip verification
│   └── slip_formatter.py # Slip message formatter
├── templates/
│   ├── login.html        # Login page
│   ├── change_password.html
│   ├── admin_dashboard.html
│   └── user_dashboard.html
├── static/
│   ├── css/
│   ├── js/
│   └── images/
├── requirements.txt
├── .env.example
└── README.md
```

## 🔧 การตั้งค่า

### MongoDB
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
MONGODB_DATABASE=lineoa_system
```

### LINE Official Account
1. ไปที่ [LINE Developers Console](https://developers.line.biz/)
2. สร้าง Provider และ Channel
3. คัดลอก:
   - Channel ID
   - Channel Secret
   - Channel Access Token
4. เพิ่มบัญชีในระบบ

### OpenAI (Optional)
```env
OPENAI_API_KEY=sk-...
```

### Slip Verification (Optional)
```env
SLIP_API_PROVIDER=thunder
SLIP_API_KEY=your_api_key
```

## 🎨 UI/UX Features

- **Modern Design** - ออกแบบทันสมัยด้วย Gradient และ Shadow
- **Responsive** - รองรับทุกขนาดหน้าจอ
- **Smooth Animations** - Animation ที่ลื่นไหล
- **Real-time Updates** - WebSocket สำหรับ notification
- **Dark Sidebar** - Sidebar สีเข้มสวยงาม
- **Card-based Layout** - จัดการด้วย Card ที่อ่านง่าย

## 🔒 Security Features

- **Password Hashing** - bcrypt
- **Session Management** - MongoDB TTL
- **Role-based Access** - แยกสิทธิ์ชัดเจน
- **Force Password Change** - บังคับเปลี่ยนรหัสผ่านครั้งแรก
- **HTTP-only Cookies** - ป้องกัน XSS

## 📊 Database Schema

### Users Collection
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
  last_login: Date,
  line_accounts: [String] // Array of LINE account IDs
}
```

### Sessions Collection
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

### LINE Accounts Collection
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

## 🛠️ API Endpoints

### Authentication
- `GET /` - Redirect to appropriate dashboard
- `GET /login` - Login page
- `POST /api/login` - Login endpoint
- `GET /logout` - Logout
- `GET /change-password` - Change password page
- `POST /api/change-password` - Change password endpoint

### Admin Routes
- `GET /admin/dashboard` - Admin dashboard
- `GET /admin/users` - User management
- `GET /admin/line-accounts` - All LINE accounts
- `GET /admin/chat-history` - All chat history

### User Routes
- `GET /user/dashboard` - User dashboard
- `GET /user/line-accounts` - User's LINE accounts
- `GET /user/chat-history` - User's chat history

### WebSocket
- `WS /ws/notifications` - Real-time notifications

## 📝 License

MIT License

## 👨‍💻 Author

LINE OA Management System Development Team

## 🙏 Acknowledgments

- FastAPI
- MongoDB
- LINE Messaging API
- OpenAI API
- Bootstrap 5
- Font Awesome

