# Thunder API - /me Endpoint

## Endpoint Details
- **URL**: https://api.thunder.in.th/v1/me
- **Method**: GET
- **Headers**: Authorization: Bearer YOUR_ACCESS_TOKEN

## Response Type
```typescript
type Data = {
    status: number
    data: {
        application: string      // ชื่อแอปพลิเคชัน
        usedQuota: number        // โควต้าที่ใช้ไปแล้ว
        maxQuota: number         // โควต้าทั้งหมด
        remainingQuota: number   // โควต้าที่เหลือ
        expiredAt: string        // วันหมดอายุ (ISO 8601)
        currentCredit: number    // เครดิตคงเหลือ
    }
}
```

## Response Example (Success)
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

## Error Responses
- 401: unauthorized - Token ไม่ถูกต้องหรือไม่มี
- 403: access_denied - ไม่มีสิทธิ์เข้าถึง
- 500: server_error - ปัญหาเซิร์ฟเวอร์
