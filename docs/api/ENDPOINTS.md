# 🔌 API Endpoints

> รายการ API endpoints ทั้งหมดของ LINE OA Management System

**Base URL**: `http://localhost:4000` (Development)

---

## 📋 Table of Contents

1. [Authentication](#-authentication)
2. [Admin APIs](#-admin-apis)
3. [User APIs](#-user-apis)
4. [Webhook](#-webhook)
5. [Health Check](#-health-check)

---

## 🔐 Authentication

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}

Response 200:
{
  "success": true,
  "user": {
    "id": "string",
    "username": "string",
    "role": "admin" | "user"
  }
}
```

### Register
```http
POST /auth/register
Content-Type: application/json

{
  "username": "string",
  "email": "string",
  "password": "string"
}
```

### Logout
```http
POST /auth/logout
```

### Get Current User
```http
GET /auth/me
Authorization: Bearer {token}

Response 200:
{
  "success": true,
  "user": { ... }
}
```

---

## 👑 Admin APIs

> ต้องมี role = "admin" ถึงจะเข้าถึงได้

### Users Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/users` | ดึงรายชื่อ users ทั้งหมด |
| GET | `/admin/users/:id` | ดึงข้อมูล user ตาม ID |
| PATCH | `/admin/users/:id` | แก้ไขข้อมูล user |
| DELETE | `/admin/users/:id` | ลบ user |
| POST | `/admin/users/:id/block` | Block user |
| POST | `/admin/users/:id/unblock` | Unblock user |

### LINE Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/line-accounts` | ดึง LINE accounts ทั้งหมด |
| POST | `/admin/line-accounts` | สร้าง LINE account ใหม่ |
| PATCH | `/admin/line-accounts/:id` | แก้ไข LINE account |
| DELETE | `/admin/line-accounts/:id` | ลบ LINE account |

### Packages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/packages` | ดึง packages ทั้งหมด |
| POST | `/packages` | สร้าง package ใหม่ |
| PATCH | `/packages/:id` | แก้ไข package |
| DELETE | `/packages/:id` | ลบ package |

### Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/payments` | ดึง payments ทั้งหมด |
| POST | `/admin/payments/:id/approve` | อนุมัติ payment |
| POST | `/admin/payments/:id/reject` | ปฏิเสธ payment |

### Chat Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/chat-messages/:accountId/users` | ดึงรายชื่อ chat users |
| GET | `/chat-messages/:accountId/:userId` | ดึงประวัติแชท |
| POST | `/chat-messages/:accountId/:userId/send` | ส่งข้อความ |
| POST | `/chat-messages/:accountId/broadcast` | Broadcast ข้อความ |

### System Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/system-settings` | ดึงการตั้งค่าระบบ |
| PATCH | `/system-settings` | แก้ไขการตั้งค่า |
| GET | `/system-settings/payment-info` | ดึงข้อมูลบัญชีธนาคาร |

### Activity Logs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/activity-logs` | ดึง logs ทั้งหมด (Admin) |
| GET | `/activity-logs/my` | ดึง logs ของตัวเอง |

---

## 👤 User APIs

> สำหรับ regular users

### LINE Accounts (Own)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/line-accounts` | ดึง LINE accounts ของตัวเอง |
| POST | `/line-accounts` | สร้าง LINE account |
| PATCH | `/line-accounts/:id` | แก้ไข LINE account |
| DELETE | `/line-accounts/:id` | ลบ LINE account |

### Payments (Own)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/payments` | ดึง payments ของตัวเอง |
| POST | `/payments` | สร้าง payment (upload slip) |

### Subscriptions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/subscriptions/current` | ดึง subscription ปัจจุบัน |
| GET | `/subscriptions/quota` | ดึงข้อมูล quota |

### Slip Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/slip-templates/:accountId` | ดึง templates |
| POST | `/slip-templates/:accountId` | สร้าง template |
| PATCH | `/slip-templates/:accountId/:id` | แก้ไข template |

---

## 🔗 Webhook

### LINE Webhook
```http
POST /webhook/line/:slug
Content-Type: application/json
X-Line-Signature: {signature}

{
  "events": [...]
}
```

---

## 💚 Health Check

```http
GET /health

Response 200:
{
  "status": "ok",
  "timestamp": "2025-01-04T12:00:00.000Z"
}
```

---

## 📝 Common Headers

```http
Authorization: Bearer {access_token}
Content-Type: application/json
```

## ⚠️ Error Responses

```json
// 400 Bad Request
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}

// 401 Unauthorized
{
  "statusCode": 401,
  "message": "Unauthorized"
}

// 403 Forbidden
{
  "statusCode": 403,
  "message": "Access denied"
}

// 404 Not Found
{
  "statusCode": 404,
  "message": "Resource not found"
}
```

---

*Last updated: 2025-01-04*
