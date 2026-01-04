# 📍 Current Project Context

> อัปเดตไฟล์นี้ทุกครั้งที่จบ session

**Last Updated**: 2025-01-04

---

## 🎯 Project Status

| Area | Status | Notes |
|------|--------|-------|
| Frontend | 🟢 Stable | Next.js 14, TypeScript |
| Backend | 🟢 Stable | NestJS, MongoDB |
| Deployment | 🟢 Running | Railway + Vercel |
| Documentation | 🟢 Complete | CLAUDE.md, docs/ created |

---

## 🏗️ Recent Changes

### 2025-01-04: AI-SDLC Infrastructure
- ✅ Created `CLAUDE.md` - AI rules and coding standards
- ✅ Created `docs/` structure - API, bugs, guides documentation
- ✅ Created `scripts/` - Automation scripts (safe-push, health-check, etc.)
- ✅ Created `memory-server/` - MCP Memory Server
- ✅ Created `.ai/` - Handoff system

---

## 🔧 Active Development

### Currently Working On:
- [None - Ready for new tasks]

### Blocked Items:
- [None]

---

## 🐛 Known Issues

| Issue | Severity | Status |
|-------|----------|--------|
| None currently | - | - |

---

## 📚 Key Information for New AI

### 1. ก่อนเริ่มงาน:
1. อ่าน `CLAUDE.md` เพื่อเข้าใจกฎของโปรเจกต์
2. อ่านไฟล์นี้ (`CURRENT_CONTEXT.md`)
3. ดู session ล่าสุดใน `.ai/sessions/`

### 2. กฎสำคัญ:
- ใช้ MongoDB + Mongoose เท่านั้น
- API path ต้องขึ้นต้นด้วย `/api/admin/` หรือ `/api/liff/`
- TypeScript strict mode, ห้ามใช้ `any`

### 3. Commands ที่ใช้บ่อย:
```bash
# Development
cd frontend && npm run dev
cd backend && npm run start:dev

# Testing
./scripts/health-check.sh

# Safe commit
./scripts/safe-push.sh "commit message"
```

---

## 📁 Project Structure Quick Reference

```
test/
├── CLAUDE.md           # 📖 AI Rules (READ FIRST!)
├── README.md           # Project overview
├── frontend/           # Next.js App
├── backend/            # NestJS API
├── docs/               # Documentation
│   ├── api/            # API endpoints
│   ├── bugs/           # Known issues
│   └── guides/         # Setup guides
├── scripts/            # Automation
│   ├── safe-push.sh
│   ├── health-check.sh
│   └── dev-start.sh
├── memory-server/      # MCP Memory Server
└── .ai/                # AI Handoff System
    ├── CURRENT_CONTEXT.md  # 👈 You are here
    ├── handoff_template.md
    └── sessions/
```

---

## 🔗 Important Links

- **GitHub**: https://github.com/komsan114411/test
- **Railway (Backend)**: [Railway Dashboard]
- **Vercel (Frontend)**: [Vercel Dashboard]
- **MongoDB Atlas**: [MongoDB Dashboard]

---

## 💬 Notes from Last Session

[Add notes from the most recent AI session here]

---

*Remember to update this file before ending your session!*
