# 📖 Setup Guide

> คู่มือการติดตั้งและรัน LINE OA Management System

---

## 📋 สารบัญ

1. [Prerequisites](#-prerequisites)
2. [Clone Project](#-clone-project)
3. [Backend Setup](#-backend-setup)
4. [Frontend Setup](#-frontend-setup)
5. [Environment Variables](#-environment-variables)
6. [Running Development](#-running-development)
7. [Docker Setup](#-docker-setup)
8. [Troubleshooting](#-troubleshooting)

---

## 📦 Prerequisites

ตรวจสอบว่าติดตั้งแล้ว:

| Tool | Version | Check Command |
|------|---------|---------------|
| Node.js | >= 20.0.0 | `node --version` |
| npm | >= 10.0.0 | `npm --version` |
| Git | any | `git --version` |
| Docker | optional | `docker --version` |

---

## 📥 Clone Project

```bash
git clone https://github.com/komsan114411/test.git
cd test
```

---

## ⚙️ Backend Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Create Environment File

```bash
cp .env.example .env
# แก้ไขค่าใน .env ตามความเหมาะสม
```

### 3. Required Environment Variables

```env
# Database (MongoDB Atlas)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/line-oa

# Authentication
JWT_SECRET=your-super-secret-jwt-key
SESSION_SECRET=your-session-secret

# LINE Messaging API
LINE_CHANNEL_ACCESS_TOKEN=your-channel-access-token
LINE_CHANNEL_SECRET=your-channel-secret

# Thunder API (Slip Verification)
THUNDER_API_KEY=your-thunder-api-key
THUNDER_API_URL=https://api.thunder.in.th

# Server
PORT=4000
CORS_ORIGIN=http://localhost:3000
```

### 4. Run Backend

```bash
# Development mode (with hot reload)
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

✅ Backend จะรันที่ `http://localhost:4000`

---

## 🖥️ Frontend Setup

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Create Environment File

```bash
# สร้างไฟล์ .env.local
```

### 3. Required Environment Variables

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_LIFF_ID=your-liff-id
```

### 4. Run Frontend

```bash
# Development mode
npm run dev

# Production build
npm run build
npm start
```

✅ Frontend จะรันที่ `http://localhost:3000`

---

## 🔐 Environment Variables

### Full List

| Variable | Location | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Backend | MongoDB connection string |
| `JWT_SECRET` | Backend | Secret for JWT tokens |
| `SESSION_SECRET` | Backend | Secret for sessions |
| `LINE_CHANNEL_ACCESS_TOKEN` | Backend | LINE API token |
| `LINE_CHANNEL_SECRET` | Backend | LINE API secret |
| `THUNDER_API_KEY` | Backend | Thunder API key |
| `PORT` | Backend | Server port (default: 4000) |
| `CORS_ORIGIN` | Backend | Allowed CORS origin |
| `NEXT_PUBLIC_API_URL` | Frontend | Backend API URL |
| `NEXT_PUBLIC_LIFF_ID` | Frontend | LINE LIFF ID |

---

## 🚀 Running Development

### Option 1: Manual (Recommended for Development)

เปิด 2 terminals:

**Terminal 1 - Backend:**
```bash
cd backend
npm run start:dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### Option 2: Using Script

```bash
./scripts/dev-start.sh
```

### Option 3: Docker

```bash
docker-compose up -d
```

---

## 🐳 Docker Setup

### Build & Run

```bash
# Build all services
docker-compose build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### docker-compose.yml Services

| Service | Port | Description |
|---------|------|-------------|
| backend | 4000 | NestJS API |
| frontend | 3000 | Next.js App |
| mongodb | 27017 | MongoDB (optional) |

---

## 🔧 Troubleshooting

### ❌ MongoDB Connection Failed

```
Error: MongoServerError: bad auth
```

**วิธีแก้**:
1. ตรวจสอบ `MONGODB_URI` ถูกต้อง
2. ตรวจสอบ IP Whitelist ใน MongoDB Atlas
3. ตรวจสอบ username/password

---

### ❌ Port Already in Use

```
Error: EADDRINUSE: address already in use :::4000
```

**วิธีแก้**:
```bash
# หา process ที่ใช้ port
lsof -i :4000

# Kill process
kill -9 <PID>
```

---

### ❌ TypeScript Errors

```bash
# ตรวจสอบ TypeScript errors
cd frontend && npx tsc --noEmit
cd backend && npx tsc --noEmit
```

---

### ❌ npm install fails

```bash
# Clear cache และลองใหม่
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

---

## ✅ Verification

หลังติดตั้งเสร็จ ตรวจสอบ:

1. **Backend Health**: `curl http://localhost:4000/health`
2. **Frontend**: เปิด `http://localhost:3000`
3. **Login**: ใช้ admin account

```bash
# หรือใช้ script
./scripts/health-check.sh
```

---

## 📚 Next Steps

1. อ่าน [CLAUDE.md](/CLAUDE.md) สำหรับ coding standards
2. ดู [API Endpoints](../api/ENDPOINTS.md) สำหรับ API reference
3. ดู [Known Issues](../bugs/KNOWN_ISSUES.md) สำหรับปัญหาที่อาจเจอ

---

*Last updated: 2025-01-04*
