# 🐛 Known Issues & Solutions

> รวบรวมปัญหาที่เคยพบและวิธีแก้ไข

---

## 📋 สารบัญ

1. [Frontend Issues](#-frontend-issues)
2. [Backend Issues](#-backend-issues)
3. [Database Issues](#-database-issues)
4. [Deployment Issues](#-deployment-issues)
5. [Security Issues](#-security-issues)

---

## 🖥️ Frontend Issues

### Issue #1: API Path ผิด
**Status**: ✅ แก้แล้ว

**ปัญหา**: Frontend เรียก `/chat-messages` แทน `/api/admin/chat-messages`

**สาเหตุ**: Copy code เก่าที่ไม่มี prefix

**วิธีแก้**:
```typescript
// ❌ ผิด
await api.get('/chat-messages/123/users');

// ✅ ถูก
await api.get('/api/admin/chat-messages/123/users');
```

**ไฟล์ที่เกี่ยวข้อง**: `frontend/src/lib/api.ts`

---

### Issue #2: Bank API returns array
**Status**: ✅ แก้แล้ว

**ปัญหา**: Frontend คิดว่า API return object แต่จริงๆ return array

**วิธีแก้**:
```typescript
// ❌ ผิด
const bank = response.data;
console.log(bank.accountNumber);

// ✅ ถูก
const { bankAccounts } = response.data;
console.log(bankAccounts[0].accountNumber);
```

---

### Issue #3: TypeScript 'channelName' not found
**Status**: ✅ แก้แล้ว

**ปัญหา**: ใช้ `channelName` แต่ type กำหนดเป็น `accountName`

**วิธีแก้**: ใช้ชื่อ property ตาม type definition
```typescript
// ❌ ผิด
{acc.channelName}

// ✅ ถูก
{acc.accountName}
```

---

## ⚙️ Backend Issues

### Issue #4: saveChatMessage returns void
**Status**: ✅ แก้แล้ว

**ปัญหา**: Function returns `void` แต่พยายามใช้ return value

**วิธีแก้**:
```typescript
// ❌ ผิด
const saved = await this.service.saveChatMessage(...);
const id = saved._id; // Error: _id doesn't exist on never

// ✅ ถูก
await this.service.saveChatMessage(...);
// Use message.id from input instead
```

---

### Issue #5: Race Condition in Quota
**Status**: ✅ แก้แล้ว

**ปัญหา**: Multiple requests อาจใช้ quota เกินจำนวน

**วิธีแก้**: ใช้ MongoDB Atomic Operations
```typescript
// ใช้ findOneAndUpdate กับ $expr
const result = await this.model.findOneAndUpdate(
  {
    userId,
    $expr: {
      $lte: [
        { $add: ['$used', '$reserved', amount] },
        '$total'
      ]
    }
  },
  { $inc: { reserved: amount } },
  { new: true }
);
```

---

### Issue #6: ObjectId Validation Missing
**Status**: ✅ แก้แล้ว

**ปัญหา**: ไม่ validate ObjectId ก่อนใช้ทำให้ crash

**วิธีแก้**:
```typescript
import { Types } from 'mongoose';

if (!Types.ObjectId.isValid(id)) {
  throw new BadRequestException('Invalid ID format');
}
```

---

## 🗄️ Database Issues

### Issue #7: Orphaned Reservations
**Status**: ✅ แก้แล้ว

**ปัญหา**: Quota reservation ค้างเมื่อ process fail

**วิธีแก้**: Implement cleanup job และ TTL
```typescript
// Auto-release reservations older than 10 minutes
@Cron('*/5 * * * *')
async cleanupStaleReservations() {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  await this.model.updateMany(
    { reservedAt: { $lt: cutoff } },
    { $set: { reserved: 0 } }
  );
}
```

---

## 🚀 Deployment Issues

### Issue #8: Railway Build Timeout
**Status**: ✅ แก้แล้ว

**ปัญหา**: Build timeout เมื่อใช้ `node:20-alpine`

**สาเหตุ**: TLS handshake issues กับ Alpine

**วิธีแก้**: เปลี่ยนเป็น `node:20-slim`
```dockerfile
# ❌ มีปัญหา
FROM node:20-alpine

# ✅ ใช้งานได้
FROM node:20-slim
```

---

### Issue #9: HEALTHCHECK fails in slim image
**Status**: ✅ แก้แล้ว

**ปัญหา**: `wget` ไม่มีใน slim image

**วิธีแก้**: ใช้ Node.js แทน
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
```

---

## 🔒 Security Issues

### Issue #10: IDOR in Slip Templates
**Status**: ✅ แก้แล้ว

**ปัญหา**: Users สามารถเข้าถึง templates ของ account อื่น

**วิธีแก้**: เพิ่ม `ensureAccountAccess()` check
```typescript
async getTemplates(accountId: string, user: AuthUser) {
  await this.ensureAccountAccess(accountId, user);
  // ... rest of logic
}
```

---

### Issue #11: XSS in Template Links
**Status**: ✅ แก้แล้ว

**ปัญหา**: `footerLink` รับ `javascript:` protocol

**วิธีแก้**: Validate URL protocol
```typescript
const ALLOWED_PROTOCOLS = ['https:', 'tel:'];

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}
```

---

### Issue #12: Hardcoded Credentials in UI
**Status**: ✅ แก้แล้ว

**ปัญหา**: Demo credentials แสดงใน login page

**วิธีแก้**: ลบ hardcoded values ออก

---

## 📊 Summary

| Category | Total | Fixed | Pending |
|----------|-------|-------|---------|
| Frontend | 3 | 3 | 0 |
| Backend | 3 | 3 | 0 |
| Database | 1 | 1 | 0 |
| Deployment | 2 | 2 | 0 |
| Security | 3 | 3 | 0 |
| **Total** | **12** | **12** | **0** |

---

*Last updated: 2025-01-04*
