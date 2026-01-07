คุณคือ Senior Backend / System Engineer
กรุณาปรับปรุงฟีเจอร์ “Webhook รับข้อมูลจาก LINE”
เพื่อแก้ปัญหา Inadequate Rate Limiting และป้องกัน DDoS Attack

## ปัญหาปัจจุบัน
- Webhook เป็นประตูหลักที่เปิดรับคำขอจาก LINE
- ไม่มีการจำกัดจำนวน request ที่ชัดเจน
- ผู้ไม่หวังดีสามารถยิง request จำนวนมากพร้อมกันได้
- ส่งผลให้ server และ database ทำงานหนักจนระบบล่ม

## เป้าหมาย
เพิ่ม “Rate Limiter” ให้กับ Webhook
- จำกัดจำนวนคำขอได้ทั้งระดับ:
  1) ต่อ LINE Official Account (Per Account)
  2) ต่อทั้งระบบ (Global)
- ปฏิเสธ request ที่เกินโควตาทันที
- ไม่ปล่อย request ที่เกินเข้า business logic
- ค่า limit ต้องสามารถตั้งค่าได้จากหลังบ้าน Admin

## แนวคิดหลัก (Concept)
- มอง Webhook เป็นประตูหน้า
- Rate Limiter คือ “ยามอัจฉริยะ” ที่ตรวจสอบก่อนทุก request
- ถ้าเกินโควตา → ตอบกลับทันทีด้วย HTTP 429
- ถ้าไม่เกิน → ส่งต่อให้ระบบทำงานปกติ

## กฎที่ต้องรองรับ (Configurable)
ต้องตั้งค่าได้จาก Admin Panel เช่น
- per_line_account:
  - x requests / second
  - x requests / minute
- global:
  - x requests / second
  - x requests / minute

ตัวอย่าง:
- 1 LINE Account: ไม่เกิน 100 requests / minute
- ทั้งระบบรวม: ไม่เกิน 1,000 requests / minute

## ข้อกำหนดทางเทคนิค
1. Rate Limiter ต้องทำงานก่อนเข้า Webhook logic
2. แยก key การนับตาม:
   - LINE Official Account ID
   - Global key
3. เมื่อเกิน limit:
   - return HTTP 429 (Too Many Requests)
   - response message: "Too many requests, please try again later"
4. ห้าม trigger database / business logic เมื่อถูก block
5. ต้องรองรับ concurrent requests ได้ดี

## การจัดเก็บค่า Rate Limit
- ค่า limit ต้องดึงจาก database หรือ config service
- Admin สามารถปรับค่าได้จากหลังบ้านโดยไม่ต้อง deploy ใหม่
- ควรมี cache (เช่น Redis / in-memory) เพื่อลด load

## สิ่งที่ต้องส่งมอบ
- โครงสร้าง rate limiting middleware / guard
- ตัวอย่างโค้ด (pseudo code หรือ code จริง)
- ตัวอย่างโครงสร้าง config จาก admin
- อธิบาย flow การทำงานตั้งแต่ request เข้า → ผ่าน/ไม่ผ่าน
- แนะนำ best practice เพิ่มเติม (เช่น sliding window, token bucket)

## ตัวอย่าง Flow ที่ต้องการ
1. Request เข้า Webhook
2. Rate Limiter อ่าน LINE Account ID
3. ตรวจสอบ quota:
   - per account
   - global
4. ถ้าเกิน → return 429
5. ถ้าไม่เกิน → forward ไป webhook handler
