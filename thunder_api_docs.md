# Thunder API Documentation

## Base URL
```
https://api.thunder.in.th/v1
```

## Authentication
All requests must include an Authorization header with a valid Bearer token.
```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

## Endpoints

### 1. Me (ข้อมูลเกี่ยวกับแอปพลิเคชัน)
Get application informations - ดึงข้อมูลโควต้าและแอปพลิเคชัน

- **URL**: `/me`
- **Method**: `GET`
- **Headers**: `Authorization: Bearer YOUR_ACCESS_TOKEN`

#### Response Type
```typescript
type Data = {
    status: number
    data: {
        application: string      // ชื่อแอปพลิเคชัน
        usedQuota: number        // จำนวนโควต้าที่ใช้งานไปแล้ว
        maxQuota: number         // โควต้าทั้งหมดที่ได้รับ
        remainingQuota: number   // โควต้าที่เหลืออยู่
        expiredAt: string        // วันหมดอายุของโควต้า (ISO 8601)
        currentCredit: number    // เครดิตที่เหลือในระบบ
    }
}
```

#### Success Response Example (HTTP 200)
```json
{
  "status": 200,
  "data": {
    "application": "Thunder Developer",
    "usedQuota": 16,
    "maxQuota": 35000,
    "remainingQuota": 34984,
    "expiredAt": "2024-02-22T18:47:34+07:00",
    "currentCredit": 1000
  }
}
```

#### Error Responses
- **401 Unauthorized**: ไม่มี Access Token หรือ Token ไม่ถูกต้อง
- **403 Access Denied**: ไม่มีสิทธิ์เข้าถึง
- **500 Server Error**: ปัญหาภายในเซิร์ฟเวอร์

### 2. Slip Verification Endpoints
- Verify By Payload: `/verify/payload`
- Verify By Image: `/verify/image`
- Verify By Base64: `/verify/base64`
- Verify By URL: `/verify/url`

### 3. Truemoney Wallet
- Verify By Image

### 4. Bill Payment
- QR Code Generator
