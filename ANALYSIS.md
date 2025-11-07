# การวิเคราะห์ปัญหาและแผนการแก้ไข

## ปัญหาที่พบ

### 1. ระบบส่งสลิปแบบ Fix ไม่ได้
จากการตรวจสอบโค้ดในไฟล์ `main.py` และ `services/slip_formatter.py` พบว่า:
- ฟังก์ชัน `send_slip_result()` ใช้ Flex Message แบบ hardcoded
- ไม่มีการใช้ Template ที่ผู้ใช้สร้างไว้ในระบบ
- ระบบมี model `SlipTemplate` แต่ไม่ได้ถูกนำมาใช้จริงในการส่งข้อความ

### 2. ไม่มีระบบเลือก Template พร้อมแสดงตัวอย่างภาพ
- มี UI สำหรับจัดการ Template แต่ไม่มีการแสดงตัวอย่างภาพ
- ไม่มีฟีเจอร์เลือก Template ก่อนส่งข้อความ
- ไม่มีการเก็บภาพตัวอย่างของแต่ละ Template

## แผนการแก้ไข

### Phase 1: เพิ่มฟีเจอร์เก็บภาพตัวอย่าง Template
1. เพิ่ม field `preview_image` ใน SlipTemplate model
2. สร้างฟังก์ชันสำหรับ upload รูปภาพตัวอย่าง
3. แก้ไข API สำหรับสร้าง/แก้ไข Template ให้รองรับการอัปโหลดรูป

### Phase 2: สร้าง UI สำหรับเลือก Template
1. สร้างหน้าเลือก Template พร้อมแสดงภาพตัวอย่าง
2. แสดง Template เป็น Card พร้อมรูปภาพ
3. เพิ่มปุ่มเลือก Template และตั้งค่าเป็น Default

### Phase 3: แก้ไขระบบส่งสลิปให้ใช้ Template
1. แก้ไขฟังก์ชัน `send_slip_result()` ให้ดึง Template ที่เลือกมาใช้
2. สร้างฟังก์ชัน render Template ด้วยข้อมูลจริง
3. รองรับทั้ง Flex Message และ Text Message

### Phase 4: ปรับปรุง Template System
1. เพิ่ม Template แบบ Flex Message
2. สร้าง Template Builder UI
3. เพิ่มตัวแปรที่ใช้ได้ใน Template

## โครงสร้างข้อมูลที่ต้องปรับปรุง

### SlipTemplate Model
```python
{
    "channel_id": str,
    "template_id": str,
    "template_name": str,
    "template_text": str,  # สำหรับ text message
    "template_flex": dict,  # สำหรับ flex message (NEW)
    "template_type": str,  # "text" หรือ "flex" (NEW)
    "preview_image": str,  # URL หรือ base64 ของรูปตัวอย่าง (NEW)
    "description": str,
    "is_default": bool,
    "created_at": datetime,
    "updated_at": datetime,
    "usage_count": int
}
```

## ตัวแปรที่ใช้ได้ใน Template
- `{amount}` - จำนวนเงิน
- `{sender}` - ชื่อผู้โอน
- `{sender_bank}` - ธนาคารผู้โอน
- `{sender_account}` - เลขบัญชีผู้โอน
- `{receiver}` - ชื่อผู้รับ
- `{receiver_bank}` - ธนาคารผู้รับ
- `{receiver_account}` - เลขบัญชีผู้รับ
- `{date}` - วันที่
- `{time}` - เวลา
- `{ref}` - เลขอ้างอิง
- `{verified_time}` - เวลาที่ตรวจสอบ
