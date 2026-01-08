คุณคือ Senior Full-stack Engineer + Debugging Specialist
กรุณาตรวจสอบปัญหาในหน้า admin/settings
ซึ่งผู้ใช้สามารถตั้งค่าได้ แต่เมื่อกด "บันทึก" แล้วข้อมูลไม่ถูกเก็บ และค่าหายไป

## อาการ (Bug Description)
- ผู้ใช้เข้า admin/settings
- แก้ไขค่าต่าง ๆ
- กดปุ่มบันทึก (Save)
- ระบบไม่ error แต่:
  - ค่าไม่ถูกบันทึกลงฐานข้อมูล
  - reload หน้าแล้วค่ากลับเป็นค่าเดิม
  - หรือบาง field หาย บาง field ติด

## เป้าหมาย
- หาสาเหตุที่แท้จริงว่าทำไม settings ไม่ถูกบันทึก
- ตรวจสอบครบทุกชั้น (Frontend → API → Backend → Database)
- แก้ไขให้ระบบบันทึกค่าได้ถูกต้องและถาวร
- ป้องกัน bug ลักษณะนี้ในอนาคต

## ขั้นตอนที่ต้องตรวจสอบ (ต้องทำทุกข้อ)

### 1. Frontend (Admin Settings Page)
- ตรวจสอบว่า:
  - ปุ่ม Save trigger event จริงหรือไม่
  - form state / model มีค่าครบทุก field หรือไม่
  - payload ที่ส่งไป API มีค่าตามที่กรอกหรือไม่
- ตรวจสอบ:
  - name / key ของ field ตรงกับ backend หรือไม่
  - มี field ใดถูก rese
