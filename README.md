# LINE OA Management System v2.0

ระบบจัดการ LINE Official Account แบบ Multi-Account พร้อมระบบ Authentication แบบ Role-based

## 🚀 Tech Stack

### Backend
- **NestJS** (TypeScript) - Modern Node.js framework
- **MongoDB** - Database with Mongoose ODM
- **Redis** - Caching and real-time features
- **Socket.IO** - WebSocket for real-time notifications
- **JWT + Session** - Authentication

### Frontend
- **Next.js 14** (React + TypeScript) - Full-stack React framework
- **TailwindCSS** - Styling
- **React Query** - Server state management
- **Zustand** - Client state management
- **Socket.IO Client** - Real-time updates

## ✨ Features

### 🔐 Authentication & Authorization
- Role-based access control (Admin/User)
- JWT + Session-based authentication
- Force password change on first login
- Default admin account: `admin` / `admin123`

### 👥 User Management
- Create, update, delete users
- Assign roles (Admin/User)
- User statistics

### 📱 LINE Account Management
- Multi-account support
- Per-account settings for AI and Slip verification
- Webhook handling for LINE messages
- Chat history

### 🤖 AI Chatbot
- OpenAI GPT integration
- Custom system prompts per account
- Conversation context (via Redis)

### 💰 Slip Verification
- Thunder API integration
- Auto-verification for payments
- Duplicate detection
- Beautiful Flex Message responses

### 📦 Package & Subscription System
- Create and manage packages
- Quota management
- Payment processing (Bank transfer, USDT)
- Auto-approve valid payments

### ⚡ Real-time Features
- WebSocket notifications
- Redis caching
- Live updates

## 🛠️ Installation

### Prerequisites
- Node.js 18+
- MongoDB
- Redis

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your settings
nano .env

# Run development server
npm run start:dev
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Edit .env.local with your settings
nano .env.local

# Run development server
npm run dev
```

## 📋 Environment Variables

### Backend (.env)
```env
MONGODB_URI=mongodb+srv://...
MONGODB_DATABASE=lineoa_system
JWT_SECRET=your-secret-key
REDIS_URL=redis://localhost:6379
PORT=4000
FRONTEND_URL=http://localhost:3000
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_WS_URL=http://localhost:4000
```

## 🌐 API Documentation

API documentation is available at:
- Swagger UI: `http://localhost:4000/api/docs`

## 📁 Project Structure

```
/
├── backend/                 # NestJS Backend
│   ├── src/
│   │   ├── auth/           # Authentication module
│   │   ├── users/          # User management
│   │   ├── line-accounts/  # LINE account management
│   │   ├── slip-verification/ # Slip verification service
│   │   ├── chatbot/        # AI chatbot service
│   │   ├── packages/       # Package management
│   │   ├── subscriptions/  # Subscription management
│   │   ├── payments/       # Payment processing
│   │   ├── system-settings/# System settings
│   │   ├── redis/          # Redis service
│   │   ├── websocket/      # WebSocket gateway
│   │   └── database/       # Database schemas
│   └── package.json
│
├── frontend/               # Next.js Frontend
│   ├── src/
│   │   ├── app/           # Next.js App Router pages
│   │   ├── components/    # React components
│   │   ├── lib/           # API client
│   │   ├── store/         # Zustand stores
│   │   ├── hooks/         # Custom hooks
│   │   └── types/         # TypeScript types
│   └── package.json
│
└── README.md
```

## 🔧 Configuration

### LINE Developers Console
1. Create a Provider and Channel at [LINE Developers](https://developers.line.biz/)
2. Get Channel ID, Secret, and Access Token
3. Set Webhook URL to: `https://your-domain.com/api/webhook/line/{channelId}`

### Thunder API (Slip Verification)
1. Register at [Thunder API](https://thunder.in.th/)
2. Get API Token
3. Configure in Admin > System Settings

### OpenAI (AI Chatbot)
1. Get API Key from [OpenAI](https://platform.openai.com/)
2. Configure in Admin > System Settings

## 📝 Default Credentials

```
Username: admin
Password: admin123
```

⚠️ **Important:** Change the default password after first login!

## 🚀 Deployment

### Docker (Recommended)
```bash
# Build and run
docker-compose up -d
```

### Manual Deployment
```bash
# Backend
cd backend
npm run build
npm run start:prod

# Frontend
cd frontend
npm run build
npm run start
```

## 📄 License

MIT License

## 👨‍💻 Development

Created with ❤️ using NestJS, Next.js, and modern web technologies.
