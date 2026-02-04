# สรุปการแก้ไขระบบ cURL Capture สำหรับ getRecentMessagesV2

## ปัญหาที่พบ

ระบบเดิมจะ capture cURL จาก **request แรก** ที่มี keys (ซึ่งอาจเป็น `getLastOpRevision`, `TalkService`, หรือ endpoint อื่น) แทนที่จะเป็น `getRecentMessagesV2` โดยเฉพาะ ทำให้:

1. cURL ที่บันทึกไว้ไม่ใช่ cURL ที่ใช้สำหรับดึงข้อความ
2. เมื่อนำ cURL ไปใช้ในการ loop ตรวจสอบ จะไม่ได้ผลลัพธ์ที่ถูกต้อง

## การแก้ไข

### 1. เพิ่ม Field ใหม่ใน Worker Interface

**ไฟล์:** `backend/src/line-session/services/worker-pool.service.ts`

```typescript
export interface Worker {
  // ... existing fields
  capturedCurl?: string; // cURL command captured from intercepted request
  capturedCurlRecentMessages?: string; // [NEW] cURL command specifically for getRecentMessagesV2
}
```

### 2. แก้ไข CDP Interception

เพิ่มการตรวจสอบว่า request เป็น `getRecentMessagesV2` หรือไม่:

```typescript
// [NEW] Check if this is specifically getRecentMessagesV2 for dedicated cURL capture
const isGetRecentMessagesV2 = url.includes('getRecentMessagesV2');
```

และบันทึก cURL ลง field เฉพาะ:

```typescript
worker.capturedCurl = curlCmd;

// [NEW] If this is getRecentMessagesV2, also save to dedicated field
if (isGetRecentMessagesV2) {
  worker.capturedCurlRecentMessages = curlCmd;
  this.logger.log(`[CDP KeyCapture SUCCESS] ✅ getRecentMessagesV2 cURL captured specifically!`);
}
```

### 3. แก้ไข Puppeteer Interception

เพิ่มการ capture เดียวกันใน Puppeteer layer เพื่อให้มี dual-layer capture

### 4. แก้ไข triggerAndCaptureKeys

**ไฟล์:** `backend/src/line-session/services/enhanced-automation.service.ts`

ใช้ `capturedCurlRecentMessages` เป็นหลัก ถ้าไม่มีจึงใช้ `capturedCurl`:

```typescript
// [NEW] Prefer getRecentMessagesV2 cURL if available, fallback to general cURL
const preferredCurl = worker.capturedCurlRecentMessages || worker.capturedCurl;
this.logger.log(`[TriggerKeys] Using cURL: ${worker.capturedCurlRecentMessages ? 'getRecentMessagesV2 (preferred)' : 'general'}`);

return {
  keys: worker.capturedKeys,
  chatMid: worker.capturedChatMid,
  cUrlBash: preferredCurl,
};
```

### 5. เพิ่มการ Clear ใน softCancelWorker

```typescript
worker.capturedCurlRecentMessages = undefined; // [NEW] Clear getRecentMessagesV2 cURL
```

## ผลลัพธ์

หลังการแก้ไข:

1. ✅ ระบบจะ capture cURL ของ `getRecentMessagesV2` โดยเฉพาะ
2. ✅ cURL ที่บันทึกจะเป็น cURL ที่ถูกต้องสำหรับดึงข้อความ
3. ✅ Loop ตรวจสอบจะใช้ cURL ที่ถูกต้อง
4. ✅ มี fallback ไปใช้ cURL ทั่วไปถ้าไม่พบ getRecentMessagesV2

## Commit

```
fix: capture cURL specifically for getRecentMessagesV2 endpoint

- Added capturedCurlRecentMessages field to Worker interface
- CDP and Puppeteer interception now capture getRecentMessagesV2 cURL separately
- triggerAndCaptureKeys prefers getRecentMessagesV2 cURL over general cURL
- Added logging to indicate which cURL type is being used
- Clear capturedCurlRecentMessages in softCancelWorker
```

## การทดสอบ

1. Re-login บัญชี LINE ที่มี GSB now
2. ตรวจสอบ log ว่ามี "getRecentMessagesV2 cURL captured specifically!" หรือไม่
3. ตรวจสอบ cURL ที่บันทึกว่า URL เป็น `getRecentMessagesV2` หรือไม่
4. ทดสอบ loop ตรวจสอบว่าดึงข้อความได้ถูกต้อง
