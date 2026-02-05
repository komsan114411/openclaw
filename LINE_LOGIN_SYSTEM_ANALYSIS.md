# 📊 รายงานวิเคราะห์ระบบ LINE Login ผ่าน LINE Chrome Extension

## 📋 สารบัญ
1. [ภาพรวมระบบ](#1-ภาพรวมระบบ)
2. [สถาปัตยกรรมระบบ](#2-สถาปัตยกรรมระบบ)
3. [ส่วนประกอบหลัก](#3-ส่วนประกอบหลัก)
4. [กระบวนการ Login](#4-กระบวนการ-login)
5. [การจัดการ Session และ Keys](#5-การจัดการ-session-และ-keys)
6. [ระบบ Real-time Notification](#6-ระบบ-real-time-notification)
7. [ความปลอดภัย](#7-ความปลอดภัย)
8. [ข้อจำกัดและข้อควรระวัง](#8-ข้อจำกัดและข้อควรระวัง)

---

## 1. ภาพรวมระบบ

### 1.1 วัตถุประสงค์
ระบบนี้ออกแบบมาเพื่อ **ดึง LINE Access Keys** (xLineAccess, xHmac) จาก LINE Chrome Extension โดยอัตโนมัติ เพื่อใช้ในการ:
- ดึงข้อความจาก LINE Chat (เช่น ข้อความแจ้งเตือนจากธนาคาร)
- ตรวจสอบสลิปโอนเงินอัตโนมัติ
- ทำ Auto-Slip Extraction

### 1.2 เทคโนโลยีที่ใช้
| ส่วน | เทคโนโลยี |
|------|-----------|
| Backend | NestJS, TypeScript, MongoDB |
| Frontend | Next.js, React, TypeScript |
| Browser Automation | Puppeteer + CDP (Chrome DevTools Protocol) |
| Real-time | Socket.IO (WebSocket) |
| Extension | LINE Chrome Extension v3.7.1 |

---

## 2. สถาปัตยกรรมระบบ

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ line-session    │  │ useLoginNotifi- │  │ lineSessionUserApi  │  │
│  │ page.tsx        │  │ cations.ts      │  │ (API Client)        │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘  │
└───────────┼────────────────────┼─────────────────────┼──────────────┘
            │                    │                     │
            │ HTTP/REST          │ WebSocket           │ HTTP/REST
            ▼                    ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Backend (NestJS)                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    LINE Session Module                       │    │
│  │  ┌──────────────────┐  ┌──────────────────────────────────┐ │    │
│  │  │ Controllers      │  │ Services                          │ │    │
│  │  │ - Admin          │  │ - EnhancedAutomationService       │ │    │
│  │  │ - User           │  │ - WorkerPoolService               │ │    │
│  │  └──────────────────┘  │ - KeyStorageService               │ │    │
│  │                        │ - SessionHealthService            │ │    │
│  │                        │ - OrchestratorService             │ │    │
│  │                        │ - LoginNotificationService        │ │    │
│  │                        │ - LoginCoordinatorService         │ │    │
│  │                        └──────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    WebSocket Gateway                         │    │
│  │  - Real-time status updates                                  │    │
│  │  - PIN countdown sync                                        │    │
│  │  - Keys captured notification                                │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
            │
            │ Puppeteer + CDP
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Chrome Browser (Puppeteer)                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              LINE Chrome Extension (v3.7.1)                  │    │
│  │  - Login with Email/Password                                 │    │
│  │  - PIN Verification                                          │    │
│  │  - Keys Extraction (xLineAccess, xHmac)                      │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. ส่วนประกอบหลัก

### 3.1 Backend Services

#### 3.1.1 [`EnhancedAutomationService`](backend/src/line-session/services/enhanced-automation.service.ts)
**หน้าที่หลัก:** ควบคุมกระบวนการ Login ทั้งหมด

```typescript
// สถานะการ Login
export enum EnhancedLoginStatus {
  IDLE = 'idle',
  REQUESTING = 'requesting',
  INITIALIZING = 'initializing',
  LAUNCHING_BROWSER = 'launching_browser',
  LOADING_EXTENSION = 'loading_extension',
  CHECKING_SESSION = 'checking_session',
  ENTERING_CREDENTIALS = 'entering_credentials',
  WAITING_PIN = 'waiting_pin',
  PIN_DISPLAYED = 'pin_displayed',
  VERIFYING = 'verifying',
  EXTRACTING_KEYS = 'extracting_keys',
  SUCCESS = 'success',
  FAILED = 'failed',
  COOLDOWN = 'cooldown',
}
```

**ฟีเจอร์สำคัญ:**
- PIN Status Tracking (FRESH < 1 min, NEW 1-5 min, OLD >= 5 min)
- Keys Status Tracking (VALID, EXPIRED, EXPIRING_SOON)
- Dual-layer interception (CDP + Puppeteer)
- Auto chatMid extraction
- Error recovery และ retry

#### 3.1.2 [`WorkerPoolService`](backend/src/line-session/services/worker-pool.service.ts)
**หน้าที่หลัก:** จัดการ Browser instances

```typescript
export interface Worker {
  id: string;
  lineAccountId: string;
  email: string;
  browser: Browser | null;
  page: Page | null;
  cdpClient: CDPSession | null;
  state: WorkerState;
  profileDir: string;
  pinCode?: string;
  capturedKeys?: { xLineAccess: string; xHmac: string };
  capturedChatMid?: string;
  capturedCurl?: string;
}
```

**ฟีเจอร์สำคัญ:**
- Profile isolation per email
- Automatic recovery on crash
- Resource cleanup
- CDP session management
- Max 30 concurrent workers

#### 3.1.3 [`KeyStorageService`](backend/src/line-session/services/key-storage.service.ts)
**หน้าที่หลัก:** จัดเก็บและจัดการ Keys

**ฟีเจอร์สำคัญ:**
- Unified session lookup (by ObjectId หรือ lineAccountId)
- Keys history tracking
- cURL command generation

#### 3.1.4 [`SessionHealthService`](backend/src/line-session/services/session-health.service.ts)
**หน้าที่หลัก:** ตรวจสอบสุขภาพของ Session

```typescript
export enum HealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  EXPIRED = 'expired',
  UNKNOWN = 'unknown',
}
```

#### 3.1.5 [`OrchestratorService`](backend/src/line-session/services/orchestrator.service.ts)
**หน้าที่หลัก:** ควบคุม Auto-Relogin Loop

**ฟีเจอร์สำคัญ:**
- Health check loop (configurable interval)
- Keys expiry detection
- Auto-relogin เมื่อ keys หมดอายุ
- Real-time status broadcasting

### 3.2 Database Schema

#### [`LineSession`](backend/src/line-session/schemas/line-session.schema.ts)
```typescript
@Schema({ collection: 'line_sessions', timestamps: true })
export class LineSession {
  @Prop({ required: true, index: true })
  ownerId: string;                    // เจ้าของ Session

  @Prop({ required: true })
  name: string;                       // ชื่อที่ผู้ใช้ตั้ง

  @Prop({ index: true })
  lineAccountId: string;              // อ้างอิง LINE Account

  @Prop()
  lineEmail: string;                  // Email สำหรับ login

  @Prop()
  linePassword: string;               // Password (encrypted)

  @Prop()
  bankCode: string;                   // รหัสธนาคาร

  @Prop()
  xLineAccess: string;                // LINE Access Token

  @Prop()
  xHmac: string;                      // HMAC Signature

  @Prop()
  chatMid: string;                    // Chat ID กับ LINE OA ธนาคาร

  @Prop({ default: 'active' })
  status: string;                     // active, expired, invalid

  @Prop()
  cUrlBash: string;                   // cURL command
}
```

### 3.3 Frontend Components

#### [`LineSessionPage`](frontend/src/app/user/line-session/page.tsx)
**หน้าที่หลัก:** UI สำหรับจัดการ LINE Session

**ฟีเจอร์:**
- สร้าง/ลบ LINE Session
- ตั้งค่า Email, Password, Bank
- เริ่ม Login และแสดง PIN
- ดู Keys และ Copy

#### [`useLoginNotifications`](frontend/src/hooks/useLoginNotifications.ts)
**หน้าที่หลัก:** Hook สำหรับ Real-time notifications

**Events ที่รับ:**
- `line-session:login-status` - สถานะ Login
- `line-session:login-event` - Events ต่างๆ
- `line-session:worker-state` - สถานะ Worker
- `line-session:keys-captured` - Keys ถูกดึงสำเร็จ
- `line-session:pin-countdown` - นับถอยหลัง PIN
- `line-session:pin-expired` - PIN หมดอายุ

---

## 4. กระบวนการ Login

### 4.1 Flow Diagram

```
┌──────────┐     ┌──────────┐     ┌──────────────────┐     ┌──────────┐
│ Frontend │     │ Backend  │     │ Puppeteer/Chrome │     │ LINE App │
└────┬─────┘     └────┬─────┘     └────────┬─────────┘     └────┬─────┘
     │                │                    │                    │
     │ 1. Start Login │                    │                    │
     │───────────────>│                    │                    │
     │                │                    │                    │
     │                │ 2. Initialize      │                    │
     │                │    Worker          │                    │
     │                │───────────────────>│                    │
     │                │                    │                    │
     │                │ 3. Load LINE       │                    │
     │                │    Extension       │                    │
     │                │───────────────────>│                    │
     │                │                    │                    │
     │                │ 4. Enter           │                    │
     │                │    Credentials     │                    │
     │                │───────────────────>│                    │
     │                │                    │                    │
     │                │ 5. PIN Generated   │                    │
     │                │<───────────────────│                    │
     │                │                    │                    │
     │ 6. PIN Display │                    │                    │
     │<───────────────│                    │                    │
     │                │                    │                    │
     │                │                    │ 7. User verifies   │
     │                │                    │    PIN on mobile   │
     │                │                    │───────────────────>│
     │                │                    │                    │
     │                │                    │ 8. Login Success   │
     │                │                    │<───────────────────│
     │                │                    │                    │
     │                │ 9. Extract Keys    │                    │
     │                │    (CDP Intercept) │                    │
     │                │<───────────────────│                    │
     │                │                    │                    │
     │ 10. Keys       │                    │                    │
     │     Captured   │                    │                    │
     │<───────────────│                    │                    │
     │                │                    │                    │
```

### 4.2 ขั้นตอนโดยละเอียด

#### Step 1: เริ่ม Login
```typescript
// Frontend เรียก API
const res = await lineSessionUserApi.setupSession(sessionId, {
  email: setupForm.email,
  password: setupForm.password,
  bankCode: setupForm.bankCode,
});
```

#### Step 2-3: Initialize Worker และ Load Extension
```typescript
// Backend สร้าง Worker
worker = await this.workerPoolService.initializeWorker(lineAccountId, credentials.email);

// Navigate ไปยัง LINE Extension
await this.navigateToExtension(worker);
```

#### Step 4: กรอก Credentials
```typescript
// กรอก Email
await page.type('input[type="email"]', email);
// กรอก Password
await page.type('input[type="password"]', password);
// กด Login
await page.click('button[type="submit"]');
```

#### Step 5-6: รอและแสดง PIN
```typescript
// รอ PIN ปรากฏ
const pinCode = await this.waitForPin(worker.page, lineAccountId);

// ส่ง PIN ไปยัง Frontend ทันที
this.emitStatus(lineAccountId, EnhancedLoginStatus.PIN_DISPLAYED, { pinCode });

// Return PIN ให้ Frontend แสดง
return {
  success: false, // ยังไม่เสร็จ แต่มี PIN
  status: EnhancedLoginStatus.PIN_DISPLAYED,
  pinCode,
  message: 'PIN displayed. Please verify on your LINE mobile app.',
};
```

#### Step 7-8: User ยืนยัน PIN บนมือถือ
- ผู้ใช้เปิด LINE App บนมือถือ
- กรอก PIN 6 หลักที่แสดงบนหน้าจอ
- LINE ยืนยันและ Login สำเร็จ

#### Step 9-10: ดึง Keys
```typescript
// CDP Interception ดักจับ Request
this.workerPoolService.setupCDPInterception(worker, (keys, chatMid) => {
  // บันทึก Keys
  await this.saveKeysToDatabase(lineAccountId, keys, chatMid, cUrlBash);
  
  // แจ้ง Frontend
  this.emitStatus(lineAccountId, EnhancedLoginStatus.SUCCESS, { keys, chatMid });
});
```

---

## 5. การจัดการ Session และ Keys

### 5.1 Keys ที่ดึงได้

| Key | คำอธิบาย | อายุการใช้งาน |
|-----|----------|---------------|
| `xLineAccess` | LINE Access Token | ~30 นาที |
| `xHmac` | HMAC Signature | ~30 นาที |
| `chatMid` | Chat ID กับ LINE OA ธนาคาร | ถาวร |
| `userAgent` | User Agent ที่ใช้ | - |
| `lineVersion` | LINE Extension Version | - |

### 5.2 PIN Status

```typescript
export enum PinStatus {
  FRESH = 'FRESH',     // < 1 minute - ใหม่มาก
  NEW = 'NEW',         // 1-5 minutes - ยังใช้ได้
  OLD = 'OLD',         // >= 5 minutes - หมดอายุ
  NO_PIN = 'NO_PIN',   // ไม่มี PIN
}
```

### 5.3 Keys Status

```typescript
export enum KeysStatus {
  UNKNOWN = 'UNKNOWN',
  VALID = 'VALID',
  EXPIRED = 'EXPIRED',
  EXPIRING_SOON = 'EXPIRING_SOON',
}
```

### 5.4 Auto-Relogin

ระบบจะ Auto-Relogin เมื่อ:
1. Keys หมดอายุ (> 30 นาที)
2. Health check ล้มเหลวติดต่อกัน 3 ครั้ง
3. Session status เป็น 'expired' หรือ 'invalid'

```typescript
// OrchestratorService ตรวจสอบทุก 10 นาที
if (this.settings?.lineSessionAutoReloginEnabled !== false) {
  this.reloginCheckInterval = setInterval(() => {
    this.performReloginCheck();
  }, reloginCheckMs);
}
```

---

## 6. ระบบ Real-time Notification

### 6.1 WebSocket Events

#### Login Status Events
```typescript
// Event: line-session:login-status
{
  type: 'login_status',
  lineAccountId: string,
  status: EnhancedLoginStatus,
  message: string,
  pinCode?: string,
  error?: string,
  timestamp: string,
}
```

#### PIN Countdown Events
```typescript
// Event: line-session:pin-countdown
{
  lineAccountId: string,
  pinCode: string,
  expiresIn: number,      // seconds
  status: 'FRESH' | 'NEW' | 'OLD',
  ageSeconds: number,
  isUsable: boolean,
  timestamp: Date,
}
```

### 6.2 Room-based Broadcasting

```typescript
// ส่งไปยัง Room เฉพาะ Account เพื่อป้องกัน PIN ปนกัน
this.websocketGateway.broadcastToRoom(
  `line-account:${payload.lineAccountId}`,
  'line-session:login-status',
  eventData,
);
```

---

## 7. ความปลอดภัย

### 7.1 Password Encryption

```typescript
// ใช้ AES-256-GCM encryption
import * as crypto from 'crypto';

export function encryptPassword(password: string, key: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  // ...
}
```

### 7.2 Session Isolation

- แต่ละ Worker มี Profile Directory แยก
- PIN ส่งไปยัง Room เฉพาะ Account
- Lock mechanism ป้องกัน concurrent login

### 7.3 Rate Limiting

```typescript
// Cooldown หลัง Login ล้มเหลว
private readonly COOLDOWN_MS = 60000; // 1 minute
```

---

## 8. ข้อจำกัดและข้อควรระวัง

### 8.1 ข้อจำกัดทางเทคนิค

| ข้อจำกัด | รายละเอียด |
|----------|------------|
| Display Required | ต้องมี Display (Xvfb หรือ Real) สำหรับ Puppeteer |
| Extension-based | ต้องใช้ LINE Chrome Extension |
| Keys Expiry | Keys หมดอายุใน ~30 นาที |
| PIN Timeout | PIN หมดอายุใน 5 นาที |
| Max Workers | รองรับสูงสุด 30 concurrent workers |

### 8.2 ข้อควรระวัง

1. **LINE Terms of Service**: การใช้งานอาจขัดกับ ToS ของ LINE
2. **Account Security**: ต้องเก็บ Credentials อย่างปลอดภัย
3. **Rate Limiting**: LINE อาจ block หาก login บ่อยเกินไป
4. **Extension Updates**: LINE Extension อาจ update และทำให้ระบบใช้งานไม่ได้

### 8.3 Environment Variables ที่จำเป็น

```env
# Puppeteer
PUPPETEER_HEADLESS=false
DISPLAY=:99
PUPPETEER_USER_DATA_DIR=/path/to/user_data

# Encryption
LINE_PASSWORD_ENCRYPTION_KEY=your-32-char-key

# Worker Pool
WORKER_POOL_MAX_WORKERS=30
```

---

## 📝 สรุป

ระบบ LINE Login ผ่าน LINE Chrome Extension นี้เป็นระบบที่ซับซ้อนประกอบด้วย:

1. **Backend Services** - 7+ services ทำงานร่วมกัน
2. **Browser Automation** - Puppeteer + CDP dual-layer interception
3. **Real-time Communication** - WebSocket สำหรับ status updates
4. **Security** - Password encryption, session isolation, rate limiting
5. **Auto-management** - Health check, auto-relogin, cleanup

ระบบนี้ออกแบบมาเพื่อรองรับการใช้งานในระดับ Production พร้อม features ที่ครบถ้วนสำหรับการจัดการ LINE Session อัตโนมัติ
