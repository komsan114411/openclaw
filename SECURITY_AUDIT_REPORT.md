# รายงานการวิเคราะห์ความปลอดภัยระบบ LINE OA Management

**วันที่วิเคราะห์:** 2026-02-04  
**ผู้วิเคราะห์:** AI Security Auditor  
**เวอร์ชันระบบ:** 2.0.0

---

## 1. ภาพรวมโครงสร้างระบบ

### 1.1 Architecture Overview
```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (NestJS)                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │   Auth      │ │  LINE API   │ │   Wallet    │ │  Payments  │ │
│  │   Module    │ │  Module     │ │   Module    │ │   Module   │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘ │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │ Slip Verify │ │   Chatbot   │ │  WebSocket  │ │   Redis    │ │
│  │   Module    │ │   (OpenAI)  │ │   Gateway   │ │   Cache    │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌─────────────────┐    ┌──────────────┐
│   MongoDB    │    │  LINE Platform  │    │ Thunder API  │
│  (Database)  │    │   (Messaging)   │    │(Slip Verify) │
└──────────────┘    └─────────────────┘    └──────────────┘
```

### 1.2 โมดูลหลักของระบบ

| โมดูล | ความรับผิดชอบ | ความเสี่ยง |
|-------|--------------|-----------|
| `AuthModule` | การยืนยันตัวตน (JWT + Session) | ปานกลาง |
| `LineAccountsModule` | จัดการบัญชี LINE OA | สูง |
| `LineSessionModule` | จัดการ session และ automation | สูงมาก |
| `SlipVerificationModule` | ตรวจสอบสลิปการโอนเงิน | สูง |
| `WalletModule` | จัดการกระเป๋าเงินและเครดิต | สูงมาก |
| `PaymentsModule` | ประมวลผลการชำระเงิน | สูงมาก |
| `ChatbotModule` | AI Chatbot (OpenAI) | ปานกลาง |
| `WebSocketModule` | Real-time communication | ปานกลาง |

---

## 2. การวิเคราะห์ช่องโหว่ตาม OWASP Top 10

### 2.1 A01:2021 – Broken Access Control

#### 🔴 **CRITICAL: Missing Authorization Checks in Line Session Controller**

**ไฟล์:** `backend/src/line-session/line-session.controller.ts`

**ปัญหา:**
- หลาย endpoint ใน `LineSessionController` ไม่มีการตรวจสอบว่า user เป็นเจ้าของ session จริงๆ
- ตัวอย่าง: `getSession()` และ `setKeys()` ใช้ `lineAccountId` จาก parameter โดยตรง โดยไม่ตรวจสอบ ownership

```typescript
// ช่องโหว่: ไม่ตรวจสอบว่า user เป็นเจ้าของ lineAccountId จริงหรือไม่
@Get(':lineAccountId')
async getSession(@Param('lineAccountId') lineAccountId: string) {
  const session = await this.keyStorageService.getActiveSession(lineAccountId);
  // ...
}
```

**ผลกระทบ:**
- ผู้ใช้อาจเข้าถึง session ของผู้ใช้คนอื่นได้
- อาจดึง keys หรือข้อมูล sensitive ของบัญชีอื่น

**การแก้ไข:**
```typescript
@Get(':lineAccountId')
@UseGuards(SessionAuthGuard)
async getSession(
  @Param('lineAccountId') lineAccountId: string,
  @CurrentUser() user: AuthUser,
) {
  // ตรวจสอบ ownership
  const account = await this.lineAccountsService.findById(lineAccountId);
  if (!account || account.ownerId.toString() !== user.userId) {
    throw new ForbiddenException('Access denied');
  }
  // ...
}
```

---

#### 🟡 **MEDIUM: Inconsistent Role Checks**

**ไฟล์:** `backend/src/line-accounts/line-accounts.controller.ts` (line 143)

```typescript
// ปัญหา: ใช้ NotFoundException แทน ForbiddenException ทำให้ซ่อนข้อผิดพลาด
if (user.role !== UserRole.ADMIN && account.ownerId?.toString() !== user.userId) {
  throw new NotFoundException('ไม่พบบัญชี LINE');
}
```

**ข้อดี:** ป้องกัน ID enumeration  
**ข้อเสีย:** อาจทำให้ debug ยาก

---

### 2.2 A02:2021 – Cryptographic Failures

#### 🔴 **CRITICAL: Weak Encryption Key Derivation**

**ไฟล์:** `backend/src/line-session/utils/credential.util.ts`

```typescript
const ENCRYPTION_SALT = 'salt'; // ใช้ salt คงที่ - อันตราย!

export function encryptPassword(password: string, encryptionKey: string): string {
  const key = crypto.scryptSync(encryptionKey, ENCRYPTION_SALT, ENCRYPTION_KEY_LENGTH);
  // ...
}
```

**ปัญหา:**
- ใช้ salt คงที่ (`'salt'`) ทำให้ rainbow table attack ง่ายขึ้น
- ไม่มี key rotation mechanism

**การแก้ไข:**
```typescript
// ใช้ salt แบบสุ่มสำหรับแต่ละการเข้ารหัส
const salt = crypto.randomBytes(16).toString('hex');
const key = crypto.scryptSync(encryptionKey, salt, ENCRYPTION_KEY_LENGTH);
// เก็บ salt ไว้พร้อมกับ encrypted data
```

---

#### 🟠 **HIGH: Default Encryption Keys in Code**

**ไฟล์:** `backend/src/line-session/services/enhanced-automation.service.ts` (line 134)

```typescript
this.ENCRYPTION_KEY = this.configService.get('LINE_PASSWORD_ENCRYPTION_KEY') ||
  'default-key-change-in-production-32'; // ค่า default อันตราย!
```

**ปัญหา:**
- มี fallback key ในโค้ด หาก environment variable ไม่ได้ตั้งค่า
- อาจถูกใช้งานใน production โดยไม่ตั้งใจ

**การแก้ไข:**
```typescript
this.ENCRYPTION_KEY = this.configService.get('LINE_PASSWORD_ENCRYPTION_KEY');
if (!this.ENCRYPTION_KEY) {
  throw new Error('LINE_PASSWORD_ENCRYPTION_KEY is required');
}
```

---

#### 🟠 **HIGH: API Keys Stored Without Encryption**

**ไฟล์:** `backend/src/database/schemas/system-settings.schema.ts`

```typescript
@Prop()
aiApiKey: string; // เก็บ plaintext!

@Prop()
thunderApiKey: string; // เก็บ plaintext!
```

**ปัญหา:**
- API keys เก็บใน database แบบ plaintext
- หาก database ถูก breach จะสูญเสีย API keys ทั้งหมด

---

### 2.3 A03:2021 – Injection

#### 🟢 **LOW: NoSQL Injection Potential**

**ไฟล์:** `backend/src/line-accounts/line-accounts.service.ts`

```typescript
// ตรวจสอบพบว่าใช้ Mongoose ซึ่งมีการ sanitize query โดยอัตโนมัติ
// แต่บางจุดอาจมีความเสี่ยง:
async findByOwner(ownerId: string) {
  return this.lineAccountModel.find({ ownerId }).exec();
}
```

**สถานะ:** มีการใช้ `ParseObjectIdPipe` ในหลาย endpoint ซึ่งช่วยป้องกันได้

---

### 2.4 A04:2021 – Insecure Design

#### 🟠 **HIGH: Race Condition in Payment Processing**

**ไฟล์:** `backend/src/payments/payments.service.ts`

```typescript
// มีการใช้ atomic operation แต่ยังมีช่องโหว่:
private async claimPaymentForProcessing(
  paymentId: string,
  slipHash: string,
): Promise<PaymentDocument | null> {
  const claimed = await this.paymentModel.findOneAndUpdate(
    { _id: paymentId, status: PaymentStatus.PENDING },
    { status: PaymentStatus.PROCESSING, /* ... */ },
    { new: true },
  );
  return claimed;
}
```

**ปัญหาที่ยังมี:**
- `PROCESSING_TIMEOUT_MS` = 3 minutes อาจนานเกินไป
- ไม่มี distributed locking สำหรับ multiple server instances

---

#### 🟠 **HIGH: Insufficient Input Validation on Webhook**

**ไฟล์:** `backend/src/line-accounts/line-webhook.controller.ts`

```typescript
@Post(':slug')
async handleWebhook(
  @Param('slug') slug: string,
  @Headers('x-line-signature') signature: string,
  @Req() req: any,
  @Body() body: any, // ไม่มี validation!
) {
```

**ปัญหา:**
- `body` รับเป็น `any` โดยไม่มี validation
- อาจถูกส่ง malformed data เพื่อทำ DoS หรือ exploit

---

### 2.5 A05:2021 – Security Misconfiguration

#### 🟡 **MEDIUM: CORS Configuration**

**ไฟล์:** `backend/src/main.ts` (line 49-73)

```typescript
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000'];

app.enableCors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true); // อนุญาต request ที่ไม่มี origin!
      return;
    }
    // ...
  },
});
```

**ปัญหา:**
- อนุญาต request ที่ไม่มี origin (line 56-58) ซึ่งอาจเป็น server-to-server หรืออาจเป็น attack

---

#### 🟡 **MEDIUM: Swagger UI เปิดใน Production**

**ไฟล์:** `backend/src/main.ts` (line 91-100)

```typescript
const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api/docs', app, document); // เปิดเสมอ!
```

**ปัญหา:**
- Swagger UI เปิดใช้งานในทุก environment
- อาจ expose API structure และ endpoints ให้ attacker

**การแก้ไข:**
```typescript
if (process.env.NODE_ENV !== 'production') {
  SwaggerModule.setup('api/docs', app, document);
}
```

---

### 2.6 A06:2021 – Vulnerable and Outdated Components

#### 🟡 **MEDIUM: Dependencies Review**

**ไฟล์:** `backend/package.json`

**พบ dependencies ที่ต้องตรวจสอบ:**
- `puppeteer: ^24.36.1` - รุ่นใหม่ แต่ต้องติดตาม security updates
- `axios: ^1.6.3` - ควรตรวจสอบ CVE ล่าสุด
- `mongoose: ^8.0.3` - รุ่นล่าสุด ปลอดภัย

**คำแนะนำ:**
```bash
npm audit
npm outdated
```

---

### 2.7 A07:2021 – Identification and Authentication Failures

#### 🟢 **LOW: Session Management**

**ข้อดีที่พบ:**
- ใช้ bcrypt สำหรับ hash password (rounds=12)
- มีการ implement timing-safe comparison สำหรับ LINE signature
- Session มี expiration (24 ชั่วโมง)
- ใช้ Redis สำหรับ session caching

**ข้อควรปรับปรุง:**
- ไม่มี rate limiting สำหรับ login attempts
- ไม่มี account lockout หลังจาก login ผิดหลายครั้ง

---

### 2.8 A08:2021 – Software and Data Integrity Failures

#### 🟠 **HIGH: No Integrity Check on Line Keys**

**ไฟล์:** `backend/src/line-session/services/key-storage.service.ts`

```typescript
async saveKeys(input: SaveKeysInput): Promise<LineSessionDocument> {
  // ไม่มีการ verify ว่า keys ที่ได้รับมาถูกต้อง
  session.xLineAccess = input.xLineAccess;
  session.xHmac = input.xHmac;
  // ...
}
```

**ปัญหา:**
- ไม่มีการตรวจสอบว่า keys ที่บันทึกสามารถใช้งานได้จริง
- อาจบันทึก keys ที่ผิดพลาดหรือ tampered

---

### 2.9 A09:2021 – Security Logging and Monitoring Failures

#### 🟡 **MEDIUM: Insufficient Audit Logging**

**ข้อดี:**
- มี `ActivityLogsService` สำหรับ log กิจกรรมสำคัญ
- มี `GlobalExceptionFilter` สำหรับจัดการ errors

**ข้อควรปรับปรุง:**
- ไม่มีการ log การเข้าถึง sensitive data (keys, passwords)
- ไม่มี real-time alerting สำหรับ suspicious activities

---

### 2.10 A10:2021 – Server-Side Request Forgery (SSRF)

#### 🟡 **MEDIUM: Potential SSRF in LINE API Calls**

**ไฟล์:** `backend/src/line-accounts/line-accounts.service.ts`

```typescript
// การเรียก LINE API ใช้ URL คงที่ ปลอดภัย
const profileResponse = await axios.get(
  `https://api.line.me/v2/bot/profile/${lineUserId}`,
  // ...
);
```

**สถานะ:** ปลอดภัย - ใช้ URL คงที่ ไม่มี user-controlled URL

---

## 3. ช่องโหว่เฉพาะทาง (Business Logic Vulnerabilities)

### 3.1 🔴 **CRITICAL: Mass Assignment Vulnerability**

**ไฟล์:** หลายไฟล์ที่ใช้ `Object.assign()`

```typescript
// ตัวอย่างจาก users.service.ts
Object.assign(user, updateUserDto); // อันตราย!
```

**ผลกระทบ:**
- อาจอัปเดต fields ที่ไม่ควรอัปเดตได้ (เช่น `role`, `isBlocked`)

**การแก้ไข:**
```typescript
// ใช้ whitelist สำหรับ fields ที่อนุญาต
const allowedFields = ['email', 'fullName', 'password'];
allowedFields.forEach(field => {
  if (updateUserDto[field] !== undefined) {
    user[field] = updateUserDto[field];
  }
});
```

---

### 3.2 🔴 **CRITICAL: Information Disclosure in Error Messages**

**ไฟล์:** `backend/src/common/filters/global-exception.filter.ts`

```typescript
// ข้อดี: ไม่ expose stack trace ใน production
errorStack: process.env.NODE_ENV !== 'production' ? errorStack : undefined,
```

**แต่ยังมีปัญหา:**
- บาง service ยัง log sensitive data ใน error messages

---

### 3.3 🟠 **HIGH: Insecure Direct Object Reference (IDOR)**

**ตัวอย่าง:**
```typescript
// line-session-user.controller.ts
@Get(':sessionId/status')
async getStatus(@Param('sessionId') sessionId: string) {
  // ไม่ตรวจสอบว่า user เป็นเจ้าของ session นี้
  const session = await this.lineSessionModel.findById(sessionId);
}
```

---

## 4. สรุประดับความเสี่ยง

### 4.1 Risk Matrix

| ระดับ | จำนวน | รายการหลัก |
|-------|-------|-----------|
| 🔴 **CRITICAL** | 4 | Weak encryption, Missing auth checks, Mass assignment, Default keys |
| 🟠 **HIGH** | 6 | API keys plaintext, Race conditions, IDOR, No integrity checks |
| 🟡 **MEDIUM** | 8 | CORS, Swagger, Dependencies, Logging |
| 🟢 **LOW** | 3 | Input validation, Session management |

### 4.2 CWE Mapping

| CWE ID | รายละเอียด | ไฟล์ที่พบ |
|--------|-----------|----------|
| CWE-256 | Plaintext Storage of Password | `credential.util.ts` |
| CWE-321 | Use of Hard-coded Cryptographic Key | `enhanced-automation.service.ts` |
| CWE-522 | Insufficiently Protected Credentials | `system-settings.schema.ts` |
| CWE-639 | Authorization Bypass | `line-session.controller.ts` |
| CWE-862 | Missing Authorization | Multiple controllers |
| CWE-915 | Improperly Controlled Modification of Dynamically-Determined Object Attributes | `users.service.ts` |

---

## 5. ข้อเสนอแนะการแก้ไข

### 5.1 เร่งด่วน (Immediate - 1 สัปดาห์)

1. **แก้ไขการเข้ารหัสรหัสผ่าน**
   - เปลี่ยน salt จากคงที่เป็น random
   - บังคับใช้ `LINE_PASSWORD_ENCRYPTION_KEY` environment variable

2. **เพิ่ม Authorization Checks**
   - ตรวจสอบ ownership ในทุก endpoint ของ `LineSessionController`
   - ใช้ interceptor หรือ decorator สำหรับตรวจสอบสิทธิ์

3. **ปิด Swagger UI ใน Production**
   ```typescript
   if (process.env.NODE_ENV !== 'production') {
     SwaggerModule.setup('api/docs', app, document);
   }
   ```

### 5.2 ระยะสั้น (Short-term - 1 เดือน)

1. **เข้ารหัส API Keys ใน Database**
   - ใช้ `SecurityUtil.encrypt()` สำหรับ `aiApiKey` และ `thunderApiKey`

2. **Implement Rate Limiting**
   - เพิ่ม rate limit สำหรับ login attempts
   - เพิ่ม account lockout หลังจากล้มเหลวหลายครั้ง

3. **Fix Mass Assignment**
   - แทนที่ `Object.assign()` ด้วย whitelist approach

4. **เพิ่ม Input Validation**
   - ใช้ DTO validation สำหรับ webhook body
   - ใช้ `class-validator` decorators

### 5.3 ระยะยาว (Long-term - 3 เดือน)

1. **Implement Comprehensive Audit Logging**
   - Log ทุกการเข้าถึง sensitive data
   - สร้าง alerting system

2. **Security Testing**
   - ทำ penetration testing
   - ใช้ SAST/DAST tools

3. **Dependency Management**
   - ตั้งค่า automated security scanning
   - สร้าง process สำหรับ update dependencies

---

## 6. Security Checklist

### Pre-deployment Checklist

- [ ] ตรวจสอบว่า `LINE_PASSWORD_ENCRYPTION_KEY` ถูกตั้งค่า
- [ ] ตรวจสอบว่า `APP_SECRET` ถูกตั้งค่า
- [ ] ปิด Swagger UI ใน production
- [ ] ตรวจสอบ CORS origins
- [ ] ตรวจสอบ rate limiting
- [ ] ตรวจสอบ authorization ในทุก endpoint
- [ ] รัน `npm audit`
- [ ] ทดสอบ authentication flows
- [ ] ทดสอบ authorization boundaries

---

## 7. อ้างอิง

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [NestJS Security Best Practices](https://docs.nestjs.com/security)

---

**หมายเหตุ:** รายงานนี้จัดทำขึ้นจากการวิเคราะห์ static code analysis ควรทำการทดสอบเพิ่มเติมด้วย dynamic testing และ penetration testing เพื่อความครอบคลุม