# 🤖 CLAUDE.md - กฎสำหรับ AI ทุกตัว

> ⚠️ **IMPORTANT**: AI ทุกตัวต้องอ่านไฟล์นี้ก่อนเริ่มทำงาน
> 📖 อ่าน `.ai/CURRENT_CONTEXT.md` เพื่อดูสถานะปัจจุบันของโปรเจกต์
> 📝 สร้าง handoff file ก่อนจบ session

---

## 📋 1. Project Overview

| รายการ | รายละเอียด |
|--------|------------|
| **ชื่อโปรเจกต์** | LINE OA Management System |
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| **Backend** | NestJS, TypeScript, Mongoose ODM |
| **Database** | MongoDB Atlas |
| **Deployment** | Vercel (Frontend), Railway (Backend) |
| **External APIs** | LINE Messaging API, Thunder API (Slip Verification) |

---

## 🚨 2. กฎเหล็ก (MUST FOLLOW)

### Database
```
✅ ใช้ MongoDB + Mongoose เท่านั้น
❌ ห้ามใช้ Prisma, PostgreSQL, SQL, หรือ ORM อื่น
```

### API Paths
```
✅ Admin APIs:  /api/admin/...
✅ LIFF APIs:   /api/liff/...
✅ Webhook:     /api/webhook/...
❌ ห้าม: /chat-messages (ต้องเป็น /api/admin/chat-messages)
```

### TypeScript
```
✅ ใช้ strict mode เสมอ
❌ ห้ามใช้ any - ต้อง define type ทุกครั้ง
```

### Frontend API Calls
```typescript
// ✅ ถูกต้อง
const API_URL = process.env.NEXT_PUBLIC_API_URL;
await fetch(`${API_URL}/api/admin/users`);

// ❌ ผิด - hardcode URL
await fetch('http://localhost:4000/users');
```

---

## 📁 3. โครงสร้างโฟลเดอร์

```
test/
├── 📂 frontend/                 # Next.js App Router
│   └── src/
│       ├── app/                # Routes (admin/, user/, auth)
│       │   ├── admin/          # Admin pages
│       │   └── user/           # User pages
│       ├── components/         # Reusable components
│       │   ├── ui/             # Base UI (Button, Card, Input)
│       │   └── layout/         # Layout components
│       ├── lib/                # Utilities
│       │   └── api.ts          # API client
│       └── types/              # TypeScript interfaces
│
├── 📂 backend/                  # NestJS API
│   └── src/
│       ├── auth/               # Authentication (session, guards)
│       ├── database/           # Mongoose schemas
│       │   └── schemas/        # MongoDB schemas
│       ├── websocket/          # Real-time gateway
│       └── [modules]/          # Feature modules
│           ├── *.controller.ts # HTTP handlers
│           ├── *.service.ts    # Business logic
│           └── *.module.ts     # Module definition
│
├── 📂 docs/                     # Documentation
├── 📂 scripts/                  # Automation scripts
├── 📂 memory-server/            # MCP Memory Server
└── 📂 .ai/                      # AI handoff system
```

---

## ⚠️ 4. Common Mistakes (บทเรียนจากอดีต)

### 🔴 API Path ผิด
```typescript
// ❌ ผิดบ่อยมาก
fetch('/chat-messages/123/users')

// ✅ ถูกต้อง
fetch('/api/admin/chat-messages/123/users')
```

### 🔴 ลืม Authorization Header
```typescript
// ❌ ลืมใส่ token
fetch('/api/admin/users')

// ✅ ต้องใส่ Bearer token
fetch('/api/admin/users', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
```

### 🔴 MongoDB ObjectId ไม่ validate
```typescript
// ❌ อาจ crash ถ้า id ผิด format
const user = await User.findById(id);

// ✅ Validate ก่อน
import { Types } from 'mongoose';
if (!Types.ObjectId.isValid(id)) {
  throw new BadRequestException('Invalid ID');
}
```

### 🔴 TypeScript 'never' type error
```typescript
// ❌ Function returns void but you use result
const saved = await this.service.saveMessage(...); // returns void
console.log(saved._id); // Error: _id doesn't exist on never

// ✅ Check return type first
await this.service.saveMessage(...);
// Use input data instead of return value
```

### 🔴 Bank API returns array
```typescript
// ❌ ผิด - คิดว่าได้ object
const bank = await api.getPaymentInfo();
console.log(bank.accountNumber);

// ✅ ถูก - API returns { bankAccounts: [...] }
const { bankAccounts } = await api.getPaymentInfo();
console.log(bankAccounts[0].accountNumber);
```

---

## 🛠️ 5. Useful Commands

### Development
```bash
# Frontend
cd frontend && npm run dev          # Start dev server (port 3000)
cd frontend && npx tsc --noEmit     # TypeScript check

# Backend
cd backend && npm run start:dev     # Start dev server (port 4000)
cd backend && npm run build         # Build for production

# Docker
docker-compose up -d                # Start all services
docker-compose logs -f backend      # View backend logs
```

### Git
```bash
# Safe push (lint first)
./scripts/safe-push.sh "commit message"

# Normal push
git add -A && git commit -m "message" && git push
```

### Testing
```bash
./scripts/health-check.sh           # Check all services
./scripts/check-api-paths.sh        # Find wrong API paths
```

---

## 🔐 6. Environment Variables

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_LIFF_ID=your_liff_id
```

### Backend (.env)
```env
# Database
MONGODB_URI=mongodb+srv://...

# Auth
JWT_SECRET=your_secret
SESSION_SECRET=your_session_secret

# LINE
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_CHANNEL_SECRET=...

# Thunder API (Slip Verification)
THUNDER_API_KEY=...
THUNDER_API_URL=https://api.thunder.in.th

# Server
PORT=4000
CORS_ORIGIN=http://localhost:3000
```

---

## 📚 7. Key Files Reference

| Purpose | File |
|---------|------|
| API Client | `frontend/src/lib/api.ts` |
| Types | `frontend/src/types/index.ts` |
| Auth Guard | `backend/src/auth/guards/session-auth.guard.ts` |
| Current User Decorator | `backend/src/auth/decorators/current-user.decorator.ts` |
| WebSocket Gateway | `backend/src/websocket/websocket.gateway.ts` |
| Schemas | `backend/src/database/schemas/*.schema.ts` |

---

## 🔄 8. AI Session Protocol

### เริ่มต้น Session
1. อ่านไฟล์นี้ (`CLAUDE.md`)
2. อ่าน `.ai/CURRENT_CONTEXT.md`
3. ดู session ล่าสุดใน `.ai/sessions/`

### ระหว่างทำงาน
- ใช้ `scripts/` สำหรับ automation
- ดู `docs/` สำหรับเอกสาร API
- บันทึกความรู้ใหม่ผ่าน Memory Server

### จบ Session
1. สร้าง handoff file: `./scripts/new-session.sh`
2. อัปเดต `.ai/CURRENT_CONTEXT.md`
3. Commit และ push changes

---

*Last updated: 2025-01-04*
