คุณคือ Senior Backend Engineer
กรุณาปรับปรุงฟีเจอร์ “การซื้อแพ็คเกจ (Package Purchase)” ของระบบ
โดยมีเป้าหมายเพื่อแก้ปัญหาการทำงานแยกระหว่าง Wallet และ Subscription

## ปัญหาปัจจุบัน
- การซื้อแพ็คเกจประกอบด้วย 2 ขั้นตอน
  1) หักเงินจาก Wallet
  2) เพิ่มสิทธิ์การใช้งาน (Subscription / Credit)
- ระบบทำงาน 2 ส่วนนี้แยกจากกัน
- หากหักเงินสำเร็จ แต่การเพิ่มสิทธิ์ล้มเหลว (เช่น server error)
  → ผู้ใช้เสียเงิน แต่ไม่ได้รับสิทธิ์

## เป้าหมาย
ทำให้การซื้อแพ็คเกจเป็น “Atomic Transaction”
- ต้องสำเร็จทั้ง 2 ขั้นตอนพร้อมกันเท่านั้น
- หากขั้นตอนใดล้มเหลว ต้อง rollback ทุกอย่าง
- ห้ามเกิดสถานการณ์ที่เงินหายแต่สิทธิ์ไม่เข้า

## แนวทางที่ต้องการ
1. มองการซื้อแพ็คเกจเป็น 1 Transaction เดียว
2. ภายใน Transaction มี 2 Action
   - Debit Wallet
   - Grant Subscription / Credit
3. ใช้ Database Transaction (BEGIN / COMMIT / ROLLBACK)
4. หากขั้นตอนใด throw error
   - rollback transaction
   - wallet balance ต้องกลับเป็นค่าเดิม
   - ห้ามสร้าง subscription ใด ๆ ค้างไว้

## สิ่งที่ต้องทำ
- ปรับปรุง logic การซื้อแพ็คเกจให้ใช้ transaction
- เขียนตัวอย่างโค้ด (pseudo code หรือ code จริง)
- รองรับกรณี:
  - Wallet balance ไม่พอ
  - Server error ระหว่าง grant สิทธิ์
  - Retry-safe (ห้ามหักเงินซ้ำ)
- เพิ่ม comment อธิบายแต่ละขั้นตอนให้ชัดเจน

## ตัวอย่างโครงสร้างที่ต้องการ
- purchasePackage(userId, packageId)
  - begin transaction
  - check wallet balance
  - deduct wallet
  - grant subscription / credit
  - commit
  - catch error → rollback

## Output ที่ต้องการ
- โค้ดตัวอย่างฝั่ง backend
- อธิบายแนวคิดการทำงานแบบ Transaction
- แนะนำ best practice เพิ่มเติม (ถ้ามี)
