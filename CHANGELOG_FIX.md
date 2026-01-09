# สรุปการแก้ไข LINE Bot - ตรวจสอบสลิป

## ปัญหาที่แก้ไข

### 1. บอทไม่ส่งเทมเพลตเมื่อส่งรูป
**ปัญหาเดิม:** เมื่อส่งรูปให้บอท บางครั้งบอทไม่ตอบหรือไม่มีอะไรเกิดขึ้น

**สาเหตุ:** เมื่อ `enableSlipVerification` ปิด โค้ดเดิมเรียก `formatBotDisabledResponse()` ซึ่งอาจ return `null` ถ้าตั้งค่า `sendMessageWhenBotDisabled = false` ทำให้บอทไม่ส่งข้อความใดๆ กลับไป

**การแก้ไข:**
- สร้าง `formatSlipDisabledResponse()` แยกจาก `formatBotDisabledResponse()` 
- ตั้งค่า default ให้ส่งข้อความตอบกลับเสมอ (`sendMessageWhenSlipDisabled = true`)
- เพิ่ม fallback message กรณีไม่มี template

### 2. ต้องการให้บอทตอบกลับทุกครั้งเมื่อส่งรูปมา
**การแก้ไข:**
- แก้ไข `line-webhook.controller.ts` ให้ส่งข้อความตอบกลับทุกครั้งเมื่อรับรูป
- เพิ่ม fallback message: `🔴 ระบบตรวจสอบสลิปปิดให้บริการชั่วคราว`

### 3. การตรวจสอบสลิปซ้ำ
**สถานะ:** ระบบมีการตรวจสอบสลิปซ้ำอยู่แล้วผ่าน Thunder API (status 409 = duplicate)

**การทำงาน:**
- เมื่อพบสลิปซ้ำ ระบบจะแสดง Slip Template สำหรับ `DUPLICATE`
- แสดงข้อมูลสลิปเดิม (จำนวนเงิน, ผู้โอน, ผู้รับ, วันที่)
- แสดงข้อความเตือน "⚠️ สลิปซ้ำ - สลิปนี้เคยถูกใช้แล้ว"

---

## ไฟล์ที่แก้ไข

### 1. `backend/src/database/schemas/system-response-template.schema.ts`
- เพิ่ม `SLIP_DISABLED = 'slip_disabled'` ใน `SystemResponseType` enum

### 2. `backend/src/system-response-templates/system-response-templates.service.ts`
- เพิ่ม default template สำหรับ `SLIP_DISABLED`:
  - ข้อความ: "🔴 ระบบตรวจสอบสลิปปิดให้บริการชั่วคราว กรุณาติดต่อผู้ดูแล"
  - รูปแบบ: Flex Message
  - สี: #64748B (เทา)

### 3. `backend/src/common/configurable-messages.service.ts`
- สร้าง `formatSlipDisabledResponse()` ใหม่:
  - ตรวจสอบการตั้งค่า `sendMessageWhenSlipDisabled` (default = true)
  - ใช้ template `SystemResponseType.SLIP_DISABLED`
  - มี fallback message กรณีไม่มี template

### 4. `backend/src/line-accounts/line-webhook.controller.ts`
- เปลี่ยนจาก `formatBotDisabledResponse()` เป็น `formatSlipDisabledResponse()`
- เพิ่ม try-catch และ fallback message
- ส่งข้อความตอบกลับทุกครั้งเมื่อรับรูป (ไม่ว่าจะมี template หรือไม่)

---

## การตั้งค่าเพิ่มเติม (ถ้าต้องการ)

### ปิดการส่งข้อความเมื่อระบบตรวจสอบสลิปปิด
ตั้งค่าใน LINE Account Settings:
```json
{
  "sendMessageWhenSlipDisabled": false
}
```

### กำหนด Template สำหรับสลิปซ้ำ
ไปที่หน้า Slip Templates และเลือก template สำหรับ `DUPLICATE` type

---

## Commit Hash
`7b0f5ff` - fix: บอทตอบกลับทุกครั้งเมื่อรับรูป และปรับปรุงการตรวจสอบสลิปซ้ำ
