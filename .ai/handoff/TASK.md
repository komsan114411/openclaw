Fix Build Error and Update Path References:

Resolve TS2307 Error: ตรวจสอบไฟล์ src/wallet/wallet.controller.ts และแก้ไขบรรทัดที่ import { JwtAuthGuard } ให้ชี้ไปยัง Path ที่ถูกต้อง (ตรวจสอบว่าหลังจากย้ายหน้าไปที่ admin/templates/ แล้ว โครงสร้างโฟลเดอร์ auth/ เปลี่ยนไปหรือไม่)

Scan for Broken Imports: ตรวจสอบไฟล์อื่นๆ ในโปรเจกต์ที่อาจจะมีปัญหาการ Import แบบเดียวกันหลังจากที่ทำการ Refactor หน้า Admin และ Template

Verify File Existence: หากไฟล์ jwt-auth.guard.ts หายไปจากการลบหรือย้ายที่ผิดพลาด ให้ทำการสร้างใหม่หรือกู้คืนไปยังตำแหน่งที่ควรจะเป็นเพื่อให้ระบบความปลอดภัยทำงานได้

Retry Build: เมื่อแก้ไข Path เสร็จแล้ว ให้ทำการรัน npm run build ใหม่อัตโนมัติใน Docker Environment

Ensure Connectivity: ตรวจสอบว่าระบบตอบกลับตามเทมเพลต (สลิปซ้ำ, บอทหมดอายุ, ฯลฯ) ยังคงเชื่อมต่อกับ Logic การตรวจสอบสิทธิ์ (Auth) ได้อย่างสมบูรณ์