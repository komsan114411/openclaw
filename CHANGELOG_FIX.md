# สรุปการแก้ไข LINE Bot ตรวจสอบสลิป

## Commit History
- `d779cc6` - fix: ปรับปรุง safeSendMessage ให้มี fallback ที่ดีขึ้น และส่งข้อความได้ทุกครั้งเมื่อรับรูป
- `8b843f6` - feat: แยกการตั้งค่าระบบตรวจสอบสลิป 2 ระดับ (แอดมิน/บัญชี LINE)
- `7f421b5` - feat: เพิ่ม UI ตั้งค่าการตอบกลับเมื่อปิดระบบตรวจสอบสลิป
- `7b0f5ff` - fix: บอทตอบกลับทุกครั้งเมื่อรับรูป และปรับปรุงการตรวจสอบสลิปซ้ำ

---

## การแก้ไขล่าสุด (d779cc6)

### ปัญหาที่แก้ไข
1. **บอทไม่ตอบกลับเมื่อส่งรูป** - บางครั้งเมื่อส่งรูปให้บอท ไม่มีข้อความตอบกลับ
2. **Reply token หมดอายุ** - เมื่อส่ง processing message ก่อน reply token จะถูกใช้ไปแล้ว
3. **Flex message format ไม่ถูกต้อง** - ถ้า template มี format ไม่ถูกต้อง LINE API จะ reject

### การแก้ไข
1. **ปรับปรุง `safeSendMessage`** ให้มี fallback ที่ดีขึ้น:
   - ลอง reply ก่อน ถ้าล้มเหลวจะลอง push แทน
   - ถ้า flex message ล้มเหลว (400 error) จะลอง text message แทน
   - มี fallback หลายชั้นเพื่อให้แน่ใจว่าข้อความจะถูกส่งไปถึงผู้ใช้

2. **แก้ไข `processEvent`** สำหรับ slip disabled:
   - ถ้าไม่มี replyToken ให้ใช้ push แทน
   - ถ้า reply ล้มเหลวจะลอง push พร้อม text fallback
   - ตรวจสอบการตั้งค่า `shouldSend` ก่อนส่ง fallback message

---

## การตั้งค่าระบบ 2 ระดับ

### 1. ระดับแอดมิน (ทั้งระบบ)
ตั้งค่าได้จากหน้า **Admin Settings > Communication**
- **เปิด/ปิดระบบตรวจสอบสลิป (ทั้งระบบ)** - ปิดจะมีผลกับทุกบัญชี LINE
- **ส่งข้อความเมื่อปิดระบบ** - เลือกได้ว่าจะส่งข้อความแจ้งหรือไม่
- **ข้อความเมื่อปิดระบบ** - กำหนดข้อความที่จะส่ง

### 2. ระดับบัญชี LINE (แต่ละบัญชี)
ตั้งค่าได้จากหน้า **บัญชี LINE > ตั้งค่า**
- **เปิด/ปิดระบบตรวจสอบสลิป** - เปิด/ปิดเฉพาะบัญชีนี้
- **ส่งข้อความเมื่อปิดระบบ** - ค่าเริ่มต้น/ส่ง/ไม่ส่ง
- **ข้อความเมื่อปิดระบบ** - กำหนดข้อความได้เอง

### ลำดับการตรวจสอบ
1. ตรวจสอบ **ระดับแอดมิน** ก่อน
2. ถ้าระดับแอดมินเปิด จึงตรวจสอบ **ระดับบัญชี LINE**
3. ถ้าทั้ง 2 ระดับเปิด จึงจะตรวจสอบสลิป
4. ถ้าอันใดอันหนึ่งปิด จะส่งข้อความแจ้งตามการตั้งค่า

---

## System Response Templates

ระบบใช้ **System Response Templates** จากหน้า `admin/system-responses/` สำหรับข้อความต่างๆ:

| Type | ชื่อ | คำอธิบาย |
|------|------|----------|
| `quota_exhausted` | โควต้าหมด | เมื่อไม่มีโควต้าเหลือ |
| `package_expired` | แพ็คเกจหมดอายุ | เมื่อแพ็คเกจหมดอายุ |
| `slip_not_found` | ไม่พบสลิป | เมื่ออ่านสลิปไม่ได้ (รวมทุกกรณี) |
| `system_error` | ข้อผิดพลาดระบบ | เมื่อเกิดข้อผิดพลาดในระบบ |
| `bot_disabled` | บอทปิดให้บริการ | เมื่อบอทถูกปิด |
| `processing` | กำลังประมวลผล | ขณะกำลังตรวจสอบ |
| `slip_disabled` | ระบบตรวจสอบสลิปปิด | เมื่อระบบตรวจสอบสลิปปิด |
| `quota_low` | โควต้าใกล้หมด | เตือนเมื่อโควต้าเหลือน้อย |

---

## Slip Templates

สำหรับผลการตรวจสอบสลิป ระบบใช้ **Slip Templates** จากหน้า `slip-templates/`:

| Type | ชื่อ | คำอธิบาย |
|------|------|----------|
| `success` | สลิปถูกต้อง | แสดงผลเมื่อสลิปถูกต้อง |
| `duplicate` | สลิปซ้ำ | แสดงผลเมื่อพบสลิปซ้ำ |
| `error` | ข้อผิดพลาด | แสดงผลเมื่อเกิดข้อผิดพลาด |
| `not_found` | ไม่พบสลิป | แสดงผลเมื่อไม่พบข้อมูลสลิป |

---

## ไฟล์ที่แก้ไข

1. `backend/src/line-accounts/line-webhook.controller.ts`
   - ปรับปรุง `safeSendMessage` ให้มี fallback ที่ดีขึ้น
   - แก้ไข `processEvent` ให้ส่งข้อความได้ทุกครั้ง

2. `backend/src/common/configurable-messages.service.ts`
   - เพิ่ม `formatSlipDisabledResponse`
   - แก้ไข `formatProcessingResponse` ให้ใช้ custom message

3. `backend/src/database/schemas/system-settings.schema.ts`
   - เพิ่ม `globalSlipVerificationEnabled`

4. `backend/src/database/schemas/system-response-template.schema.ts`
   - เพิ่ม `SLIP_DISABLED` enum

5. `backend/src/system-response-templates/system-response-templates.service.ts`
   - เพิ่ม default template สำหรับ `SLIP_DISABLED`

6. `frontend/src/app/admin/settings/page.tsx`
   - เพิ่ม UI สำหรับ Global Slip Verification Switch

7. `frontend/src/app/user/line-accounts/page.tsx`
   - เพิ่ม UI สำหรับตั้งค่าการตอบกลับเมื่อปิดระบบตรวจสอบสลิป
