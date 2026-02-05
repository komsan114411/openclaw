# 📊 System Structure Report - LINE OA Management System

> **Generated**: 2026-02-03
> **Project**: LINE OA Management System (aisilp)

---

## 🏗️ 1. Overall Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LINE OA Management System                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  Frontend   │    │   Backend   │    │     GSB     │    │    Redis    │  │
│  │  (Next.js)  │◄──►│  (NestJS)   │◄──►│  (Express)  │    │   (Cache)   │  │
│  │  Port 3000  │    │  Port 4000  │    │  Standalone │    │  Port 6379  │  │
│  └─────────────┘    └──────┬──────┘    └─────────────┘    └─────────────┘  │
│                            │                                                │
│                            ▼                                                │
│                    ┌─────────────┐                                          │
│                    │  MongoDB    │                                          │
│                    │   Atlas     │                                          │
│                    └─────────────┘                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 2. Root Directory Structure

```
aisilp/
├── 📄 Configuration Files
│   ├── .env                    # Environment variables
│   ├── .gitignore              # Git ignore rules
│   ├── docker-compose.yml      # Docker orchestration
│   ├── Dockerfile              # Root Dockerfile
│   ├── nixpacks.toml           # Nixpacks config (Railway)
│   ├── package.json            # Root package.json
│   └── railway.json            # Railway deployment config
│
├── 📄 Documentation Files
│   ├── CLAUDE.md               # AI instructions
│   ├── README.md               # Project readme
│   ├── BANK_SYSTEM_DOCUMENTATION.md
│   ├── BUG_FIXES_REPORT.md
│   ├── CHANGELOG_FIX.md
│   ├── FEATURE_UPDATE_REPORT.md
│   ├── FIX_REPORT.md
│   ├── FIXES_SUMMARY.md
│   ├── IMPLEMENTATION_SUMMARY.md
│   ├── IMPROVEMENT_PLAN.md
│   ├── ISSUES_ANALYSIS_REPORT.md
│   ├── UI_UX_IMPROVEMENTS.md
│   ├── log.md
│   ├── system_analysis.md
│   ├── thunder_api_docs.md
│   └── thunder_me_api.md
│
├── 📂 backend/                 # NestJS Backend (Main)
├── 📂 frontend/                # Next.js Frontend
├── 📂 gsb/                     # GSB Bank System (Standalone)
├── 📂 docs/                    # Documentation
├── 📂 scripts/                 # Automation scripts
├── 📂 memory-server/           # MCP Memory Server
├── 📂 test/                    # Test files (empty)
└── 📂 .ai/                     # AI handoff system
```

---

## 🔧 3. Backend Structure (NestJS)

### Technology Stack
| Component | Technology |
|-----------|------------|
| Framework | NestJS 10.x |
| Language | TypeScript 5.x |
| Database | MongoDB (Mongoose ODM) |
| Cache | Redis (ioredis) |
| Auth | JWT + Passport |
| WebSocket | Socket.io |
| Automation | Puppeteer |

### Module Architecture

```
backend/src/
├── 📄 Core Files
│   ├── main.ts                 # Application entry point
│   └── app.module.ts           # Root module
│
├── 📂 Core Modules
│   ├── auth/                   # Authentication & Authorization
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.module.ts
│   │   ├── decorators/         # @CurrentUser, @Roles
│   │   ├── guards/             # JWT, Session, Roles guards
│   │   ├── strategies/         # JWT, Local strategies
│   │   └── dto/                # Login, Register DTOs
│   │
│   ├── database/               # Database configuration
│   │   ├── database.module.ts
│   │   └── schemas/            # MongoDB Schemas (20+ schemas)
│   │       ├── user.schema.ts
│   │       ├── line-account.schema.ts
│   │       ├── bank.schema.ts
│   │       ├── slip-history.schema.ts
│   │       ├── wallet.schema.ts
│   │       └── ... (more schemas)
│   │
│   ├── redis/                  # Redis caching
│   │   ├── redis.module.ts
│   │   ├── redis.service.ts
│   │   └── redis.constants.ts
│   │
│   └── websocket/              # Real-time communication
│       └── websocket.gateway.ts
│
├── 📂 Feature Modules
│   ├── users/                  # User management
│   ├── line-accounts/          # LINE account management
│   ├── slip-verification/      # Slip verification (Multi-provider)
│   │   ├── providers/
│   │   │   ├── thunder.provider.ts
│   │   │   ├── slipmate.provider.ts
│   │   │   └── slip2go.provider.ts
│   │   └── slip-verification.manager.ts
│   │
│   ├── chatbot/                # AI Chatbot (OpenAI)
│   ├── packages/               # Subscription packages
│   ├── subscriptions/          # User subscriptions
│   ├── payments/               # Payment processing
│   ├── wallet/                 # Wallet & USDT
│   │   ├── wallet.service.ts
│   │   ├── usdt-rate.service.ts
│   │   ├── tron-verification.service.ts
│   │   └── blockchain-verification.service.ts
│   │
│   ├── banks/                  # Bank management
│   ├── announcements/          # System announcements
│   ├── activity-logs/          # Activity logging
│   ├── chat-messages/          # Chat message storage
│   ├── slip-templates/         # Slip templates
│   ├── system-settings/        # System configuration
│   ├── system-response-templates/
│   └── thunder-api/            # Thunder API integration
│
├── 📂 Standalone Modules (Removable)
│   ├── line-session/           # LINE Session Management
│   │   ├── line-session.module.ts
│   │   ├── line-session.controller.ts
│   │   ├── line-session-user.controller.ts
│   │   ├── schemas/
│   │   │   ├── line-session.schema.ts
│   │   │   ├── line-message.schema.ts
│   │   │   ├── line-key-history.schema.ts
│   │   │   └── bank-list.schema.ts
│   │   ├── services/
│   │   │   ├── orchestrator.service.ts
│   │   │   ├── worker-pool.service.ts
│   │   │   ├── session-health.service.ts
│   │   │   ├── login-coordinator.service.ts
│   │   │   ├── relogin-scheduler.service.ts
│   │   │   ├── key-storage.service.ts
│   │   │   ├── message-fetch.service.ts
│   │   │   ├── line-automation.service.ts
│   │   │   └── enhanced-automation.service.ts
│   │   └── dto/
│   │
│   └── auto-slip-extraction/   # Auto Slip Extraction
│       ├── auto-slip-extraction.module.ts
│       ├── auto-slip-extraction.controller.ts
│       ├── schemas/
│       │   ├── auto-slip-transaction.schema.ts
│       │   ├── auto-slip-pin-code.schema.ts
│       │   └── auto-slip-status-history.schema.ts
│       └── services/
│           └── transaction-fetcher.service.ts
│
├── 📂 Common/Utilities
│   ├── common/                 # Shared utilities
│   │   ├── common.module.ts
│   │   ├── rate-limit.module.ts
│   │   ├── filters/            # Exception filters
│   │   ├── guards/             # Rate limit guards
│   │   ├── pipes/              # Validation pipes
│   │   ├── services/           # Rate limit service
│   │   └── utils/              # Activity logger, validation
│   │
│   ├── core/events/            # Event bus system
│   │   ├── event-bus.module.ts
│   │   ├── event-bus.service.ts
│   │   └── domain-events.ts
│   │
│   ├── utils/                  # Security utilities
│   │   ├── security.module.ts
│   │   └── security.util.ts
│   │
│   ├── health/                 # Health checks
│   └── tasks/                  # Scheduled tasks
│
└── 📂 Extensions
    └── line/                   # LINE Chrome Extension
```

### Key Dependencies
```json
{
  "@nestjs/common": "^10.3.0",
  "@nestjs/mongoose": "^10.0.2",
  "@nestjs/jwt": "^10.2.0",
  "@nestjs/passport": "^10.0.3",
  "@nestjs/websockets": "^10.3.0",
  "mongoose": "^8.0.3",
  "ioredis": "^5.3.2",
  "puppeteer": "^24.36.1",
  "openai": "^4.24.1"
}
```

---

## 🎨 4. Frontend Structure (Next.js)

### Technology Stack
| Component | Technology |
|-----------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5.x |
| Styling | Tailwind CSS 3.x |
| State | Zustand |
| Data Fetching | TanStack Query |
| Forms | React Hook Form |
| UI Components | Custom + Lucide Icons |

### Directory Structure

```
frontend/src/
├── 📂 app/                     # Next.js App Router
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Landing page
│   ├── providers.tsx           # Context providers
│   ├── globals.css             # Global styles
│   │
│   ├── 📂 admin/               # Admin Dashboard
│   │   ├── dashboard/          # Admin overview
│   │   ├── users/              # User management
│   │   ├── line-accounts/      # LINE accounts
│   │   ├── banks/              # Bank management
│   │   ├── bank-monitor/       # Bank monitoring
│   │   ├── auto-slip/          # Auto slip extraction
│   │   ├── packages/           # Package management
│   │   ├── payments/           # Payment management
│   │   ├── credits/            # Credit management
│   │   ├── wallet-transactions/# Wallet transactions
│   │   ├── history/            # Slip history
│   │   ├── chat/               # Chat management
│   │   ├── templates/          # Template management
│   │   ├── announcements/      # Announcements
│   │   ├── settings/           # System settings
│   │   └── line-session-settings/
│   │
│   ├── 📂 user/                # User Dashboard
│   │   ├── dashboard/          # User overview
│   │   ├── line-accounts/      # User's LINE accounts
│   │   ├── line-session/       # LINE session
│   │   ├── auto-slip/          # Auto slip
│   │   ├── packages/           # Available packages
│   │   ├── payments/           # Payment history
│   │   ├── quota/              # Quota usage
│   │   ├── wallet/             # Wallet
│   │   │   └── deposit/        # Deposit page
│   │   ├── history/            # Slip history
│   │   ├── chat/               # Chat
│   │   └── templates/          # Templates
│   │
│   ├── 📂 login/               # Login page
│   ├── 📂 register/            # Registration page
│   └── 📂 change-password/     # Password change
│
├── 📂 components/              # Reusable components
│   ├── layout/
│   │   ├── DashboardLayout.tsx
│   │   └── Sidebar.tsx
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Badge.tsx
│   │   ├── Loading.tsx
│   │   ├── Toast.tsx
│   │   └── ... (more)
│   ├── AnnouncementBanner.tsx
│   ├── AuthStateListener.tsx
│   ├── ErrorBoundary.tsx
│   └── FloatingContactButton.tsx
│
├── 📂 lib/                     # Utilities
│   ├── api.ts                  # API client
│   └── utils.ts                # Helper functions
│
├── 📂 store/                   # Zustand stores
│   ├── auth.ts                 # Auth state
│   └── wallet.ts               # Wallet state
│
├── 📂 hooks/                   # Custom hooks
│   ├── useAsync.ts
│   ├── useConfirm.ts
│   └── useLoginNotifications.ts
│
├── 📂 constants/               # Constants
│   ├── index.ts
│   └── login.ts
│
└── 📂 types/                   # TypeScript types
    └── index.ts
```

### Key Dependencies
```json
{
  "next": "^14.0.4",
  "react": "^18.2.0",
  "@tanstack/react-query": "^5.17.0",
  "zustand": "^4.4.7",
  "tailwindcss": "^3.4.0",
  "framer-motion": "^10.17.9",
  "lucide-react": "^0.562.0"
}
```

---

## 🏦 5. GSB System Structure (Standalone Bank System)

### Overview
GSB is a **standalone bank management system** with its own backend and frontend. It uses **Prisma + MongoDB** instead of Mongoose.

### Directory Structure

```
gsb/
├── 📄 Dockerfile               # GSB Dockerfile
├── 📄 fix-prompt.md            # Fix instructions
│
├── 📂 bank-api-ref/            # Bank API Reference
│   ├── package.json
│   ├── model/mongo.js
│   └── routes/scb.js           # SCB bank integration
│
├── 📂 bankmanager-master/      # Original Bank Manager
│   ├── docker-compose.yml
│   ├── Dockerfile
│   ├── gateway.js
│   └── apps/frontend/          # Frontend (Next.js)
│
├── 📂 bankmanager-ref/         # Reference implementation
│
├── 📂 lineapi-ref/             # LINE API Reference
│
└── 📂 lineapi2/                # Main GSB System
    └── bankmanager-master/
        ├── 📂 apps/
        │   ├── 📂 backend/     # Express.js Backend
        │   │   ├── package.json
        │   │   ├── app.js      # Entry point
        │   │   │
        │   │   ├── 📂 prisma/
        │   │   │   ├── schema.prisma  # Database schema
        │   │   │   ├── seed.js
        │   │   │   └── migrations/
        │   │   │
        │   │   ├── 📂 routes/
        │   │   │   ├── bank.route.js
        │   │   │   ├── bot.route.js
        │   │   │   ├── dashboard.route.js
        │   │   │   ├── message.route.js
        │   │   │   ├── monitor.route.js
        │   │   │   ├── packages.route.js
        │   │   │   ├── pin.route.js
        │   │   │   ├── settings.route.js
        │   │   │   ├── stats.route.js
        │   │   │   ├── upload.route.js
        │   │   │   └── user.route.js
        │   │   │
        │   │   ├── 📂 services/
        │   │   │   ├── orchestrator.service.js
        │   │   │   ├── workerPool.service.js
        │   │   │   ├── sessionHealth.service.js
        │   │   │   ├── reLogin.service.js
        │   │   │   ├── keyStorage.service.js
        │   │   │   ├── transactionFetcher.service.js
        │   │   │   ├── botAutomation.service.js
        │   │   │   ├── lineAccount.service.js
        │   │   │   ├── bankStateMachine.service.js
        │   │   │   ├── circuitBreaker.service.js
        │   │   │   ├── distributedLock.service.js
        │   │   │   ├── autoRecovery.service.js
        │   │   │   ├── alertService.service.js
        │   │   │   ├── metrics.service.js
        │   │   │   └── ... (more services)
        │   │   │
        │   │   ├── 📂 middleware/
        │   │   │   ├── authMiddleware.js
        │   │   │   ├── logger.js
        │   │   │   ├── rateLimit.js
        │   │   │   └── security.js
        │   │   │
        │   │   ├── 📂 queue/re-login/
        │   │   │   ├── reloginQueue.js
        │   │   │   ├── reloginTaskList.js
        │   │   │   └── reloginWorker.js
        │   │   │
        │   │   ├── 📂 redis/
        │   │   │   └── redis-config.js
        │   │   │
        │   │   ├── 📂 lib/
        │   │   │   ├── prisma.js
        │   │   │   ├── errorHandler.js
        │   │   │   ├── validateEnv.js
        │   │   │   └── validation.js
        │   │   │
        │   │   ├── 📂 scripts/
        │   │   │   ├── createAdmin.js
        │   │   │   └── createDefaultPackage.js
        │   │   │
        │   │   └── 📂 extensions/
        │   │       ├── line/           # LINE Chrome Extension
        │   │       └── user_data/      # User data storage
        │   │
        │   └── 📂 frontend/    # Next.js Frontend
        │       ├── package.json
        │       ├── Dockerfile
        │       ├── 📂 src/
        │       │   ├── app/
        │       │   │   ├── admin/page.js
        │       │   │   ├── user/page.js
        │       │   │   ├── login/page.js
        │       │   │   ├── register/page.js
        │       │   │   ├── pin/page.js
        │       │   │   └── forgot/page.js
        │       │   ├── components/Admin/
        │       │   │   ├── Dashboard.js
        │       │   │   ├── Bank.js
        │       │   │   ├── BankMessage.js
        │       │   │   ├── MonitorDashboard.js
        │       │   │   ├── RealTimeStatus.js
        │       │   │   ├── SystemDashboard.js
        │       │   │   ├── Users.js
        │       │   │   ├── Packages.js
        │       │   │   └── Settings.js
        │       │   └── modules/
        │       │       ├── api.js
        │       │       ├── Authen.js
        │       │       └── ConvertTime.js
        │       └── public/
        │
        └── docker-compose.yml
```

### GSB Database Schema (Prisma)

```prisma
// Key Models in GSB
model User {
  id              String    @id @default(auto()) @map("_id") @db.ObjectId
  username        String?   @unique
  password        String?
  role            String    @default("USER")
  current_package String?   @db.ObjectId
  expired         DateTime?
}

model Bank {
  id                 String    @id @default(auto()) @map("_id") @db.ObjectId
  name               String
  bank               String
  bank_code          String
  userId             String?   @db.ObjectId
  status             String?   @default("INIT")
  xhmac              String?
  x_line_access      String?
  line_email         String?
  line_password      String?
}

model LineData {
  id            String    @id @default(auto()) @map("_id") @db.ObjectId
  messageId     String
  text          String?
  amount        String?
  balance       String?
  bank_id       String    @db.ObjectId
}

model LineAccount {
  id               String    @id @default(auto()) @map("_id") @db.ObjectId
  bankId           String    @db.ObjectId
  email            String
  status           String    @default("INACTIVE")
  xhmac            String?
  x_line_access    String?
}

model Transaction {
  id              String    @id @default(auto()) @map("_id") @db.ObjectId
  bankId          String    @db.ObjectId
  type            String?
  amount          Float?
  balance         Float?
}
```

### GSB Key Dependencies
```json
{
  "@prisma/client": "^5.14.0",
  "express": "^4.19.2",
  "bullmq": "^5.52.1",
  "puppeteer": "^22.13.1",
  "ioredis": "^5.6.1",
  "socket.io": "^4.7.5"
}
```

---

## 📚 6. Documentation Structure

```
docs/
├── INDEX.md                    # Documentation index
├── api/
│   └── ENDPOINTS.md            # API endpoint documentation
├── bugs/
│   └── KNOWN_ISSUES.md         # Known issues
└── guides/
    └── SETUP.md                # Setup guide
```

---

## 🔧 7. Scripts Structure

```
scripts/
├── 📄 Utility Scripts
│   ├── check-api-paths.sh      # Check API path consistency
│   ├── dev-start.sh            # Start development servers
│   ├── health-check.sh         # Health check all services
│   ├── new-session.sh          # Create new AI session
│   ├── safe-push.sh            # Safe git push with lint
│   ├── test-and-fix.sh         # Test and auto-fix
│   └── verify-work.sh          # Verify work completion
│
└── 📂 ai-loop/                 # AI Loop System
    ├── config.json             # AI loop configuration
    ├── README.md               # AI loop documentation
    ├── developer.md            # Developer instructions
    ├── reviewer.md             # Reviewer instructions
    ├── create-task.bat         # Create task (Windows)
    ├── create-task.sh          # Create task (Unix)
    ├── monitor.bat             # Monitor (Windows)
    ├── monitor.sh              # Monitor (Unix)
    ├── start-loop.bat          # Start loop (Windows)
    └── start-loop.sh           # Start loop (Unix)
```

---

## 🐳 8. Docker Configuration

### docker-compose.yml
```yaml
services:
  backend:
    build: ./backend
    ports: ["4000:4000"]
    depends_on: [redis]
    
  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    depends_on: [backend]
    
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
```

### Service Ports
| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | Next.js web app |
| Backend | 4000 | NestJS API |
| Redis | 6379 | Cache server |
| MongoDB | 27017 | Database (Atlas) |

---

## 🔄 9. System Comparison: Main vs GSB

| Feature | Main System (backend/) | GSB System (gsb/) |
|---------|------------------------|-------------------|
| **Framework** | NestJS (TypeScript) | Express.js (JavaScript) |
| **ORM** | Mongoose | Prisma |
| **Database** | MongoDB | MongoDB |
| **Architecture** | Modular (NestJS modules) | Route-based |
| **Auth** | JWT + Passport | JWT |
| **WebSocket** | Socket.io (NestJS) | Socket.io |
| **Queue** | - | BullMQ |
| **Automation** | Puppeteer | Puppeteer |
| **State Machine** | - | Bank State Machine |
| **Circuit Breaker** | - | Yes |
| **Distributed Lock** | - | Yes |

---

## 📊 10. Key Features by Module

### Main Backend Features
1. **Authentication** - JWT, Session, Role-based access
2. **LINE Integration** - Account management, Webhook handling
3. **Slip Verification** - Multi-provider (Thunder, SlipMate, Slip2Go)
4. **AI Chatbot** - OpenAI integration with quota management
5. **Wallet System** - USDT, Blockchain verification
6. **Subscription** - Package management, Credit system
7. **Real-time** - WebSocket notifications

### GSB Features
1. **Bank Management** - Multi-bank support with state machine
2. **LINE Session** - Automated login, Key extraction
3. **Transaction Fetching** - Auto-fetch from LINE messages
4. **Worker Pool** - Concurrent task processing
5. **Circuit Breaker** - Fault tolerance
6. **Auto Recovery** - Self-healing system
7. **Monitoring** - Real-time status dashboard

---

## 🔐 11. Security Features

### Main System
- JWT authentication
- Session management
- Role-based access control (Admin/User)
- Rate limiting
- Helmet security headers
- CORS configuration

### GSB System
- JWT authentication
- Rate limiting middleware
- Security middleware
- Distributed locking
- Error handling

---

## 📈 12. Scalability Considerations

### Database
- MongoDB connection pooling (10-100 connections)
- Indexed queries
- Compression enabled

### Caching
- Redis for session storage
- Rate limit tracking
- Job queue management

### Processing
- Worker pool for concurrent tasks
- BullMQ for job queuing (GSB)
- Circuit breaker for fault tolerance

---

## 🎯 13. Summary

The **LINE OA Management System** consists of:

1. **Main System** (NestJS + Next.js)
   - Production-ready architecture
   - TypeScript throughout
   - Modular design
   - Multi-provider slip verification

2. **GSB System** (Express.js + Next.js)
   - Standalone bank management
   - Advanced automation features
   - State machine for bank status
   - Self-healing capabilities

Both systems share:
- MongoDB database
- Redis caching
- Puppeteer automation
- Socket.io real-time
- LINE integration

---

*Report generated: 2026-02-03*
