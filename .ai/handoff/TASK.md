จงสวมบทบาทเป็น **Senior Full Stack Developer** และแก้ไขหน้า `frontend/src/app/user/line-accounts/page.tsx` (หรือไฟล์ Component ที่เกี่ยวข้องกับการตั้งค่า Line Account)

**ปัญหาปัจจุบัน:**
ในฟอร์มเพิ่ม/แก้ไขบัญชี LINE การเลือก "รูปแบบสลิป (Template)" ยังเป็นแบบ Hardcode หรือยังไม่มีฟังก์ชันเลือก และไม่มีการแสดงตัวอย่าง (Preview) ทำให้ผู้ใช้ไม่รู้ว่าเลือกแบบไหนไป

**สิ่งที่คุณต้องทำ (Requirements):**
1.  **Dynamic Data Fetching:**
    * ให้เขียนฟังก์ชันดึงข้อมูล Template ทั้งหมดจาก API (เช่น `GET /slip-templates` หรือ endpoint ที่ถูกต้อง) มาแสดงใน Dropdown เลือก
    * **ห้าม** Hardcode ข้อมูล Template เอง ข้อมูลต้องมาจาก Admin ที่สร้างไว้ในระบบเท่านั้น

2.  **Real-time Preview:**
    * เมื่อผู้ใช้เลือก Template ใน Dropdown ให้แสดง Component **"SlipPreview"** (จำลองหน้าตาสลิป) ขึ้นมาทันที
    * หากยังไม่ได้เลือก ให้แสดงข้อความว่า "กรุณาเลือกรูปแบบสลิปเพื่อดูตัวอย่าง"

3.  **Form Integration:**
    * ให้เชื่อมต่อค่า `templateId` ที่เลือก เข้ากับ Form State ของ Line Account
    * เมื่อกดบันทึก (Save/Update) ให้ส่ง `templateId` ไปยัง API (`POST` หรือ `PATCH /line-accounts`) อย่างถูกต้อง

4.  **UI/UX:**
    * ใช้ Layout แบบ 2 Columns: ด้านซ้ายเป็นฟอร์มตั้งค่า (Token, Name, Template Select), ด้านขวาเป็นส่วนแสดงตัวอย่าง (Preview)
    * หาก Template นั้นมีธีมสี (themeColor) ให้ Preview แสดงผลตามสีนั้นๆ

