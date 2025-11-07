# การวิเคราะห์ปัญหา (Round 2)

## ปัญหาที่พบจาก Log และรูปภาพ

### 1. ❌ Error: 'str' object has no attribute 'get'
**ที่เกิด**: `slip_formatter.py` line 239
```python
sender_name = sender.get("account", {}).get("name", {})
```

**สาเหตุ**: 
- ข้อมูล `sender` ในบาง case เป็น string แทนที่จะเป็น dict
- จาก log: `'sender': 'นาย วินฉลิม แก้นนี'` (เป็น string)
- แต่โค้ดคาดหวังว่าจะเป็น dict

**ผลกระทบ**:
- Flex Message สร้างไม่สำเร็จ
- ตกไปใช้ error message แทน
- ผู้ใช้เห็นแต่ข้อความ error

### 2. ❌ ระบบไม่ตอบกลับตามเทมเพลตที่เลือก
**สาเหตุ**:
- Template type ถูกตั้งเป็น "flex" แต่ไม่มี template_flex data
- เมื่อ template_type = "flex" และ template_flex = None
- ระบบจะไปเรียก `create_beautiful_slip_flex_message()` 
- แต่ฟังก์ชันนี้มี bug ทำให้ fail

**ผลกระทบ**:
- ไม่ได้ใช้ template ที่เลือก
- ส่ง error message แทน

### 3. ❌ ไม่มีการแสดงตัวอย่างเทมเพลตข้างๆ
**สาเหตุ**:
- UI ยังไม่มีส่วน preview template
- ไม่มี modal หรือ sidebar แสดงตัวอย่าง

### 4. ❌ เลือกเทมเพลตแล้วขึ้นสีขาว
**สาเหตุ**:
- รูปภาพตัวอย่างอาจโหลดไม่ได้
- หรือ path ผิด

## แผนการแก้ไข

### Phase 1: แก้ไข slip_formatter.py
1. ตรวจสอบ type ของ sender/receiver ก่อนใช้ .get()
2. รองรับทั้ง dict และ string
3. เพิ่ม error handling ที่ดีขึ้น

### Phase 2: สร้าง Flex Message Template ที่ถูกต้อง
1. สร้าง template ที่เก็บใน database
2. ใช้ตัวแปร placeholder แทนข้อมูลจริง
3. มีฟังก์ชัน render template ด้วยข้อมูลจริง

### Phase 3: เพิ่ม Preview UI
1. เพิ่ม modal แสดงตัวอย่าง Flex Message
2. แสดงข้างๆเมื่อเลือก template
3. ใช้ข้อมูลตัวอย่างในการแสดง

### Phase 4: แก้ไขระบบส่ง Flex Message
1. ดึง template_flex จาก database
2. Render ด้วยข้อมูลจริง
3. ส่งไปยัง LINE API

## โครงสร้างข้อมูลที่ถูกต้อง

### Thunder API Response (ที่เป็นจริง)
```json
{
  "status": "duplicate",
  "data": {
    "transRef": "53070260912",
    "amount": 160,
    "date": "03 พ.ย. 68",
    "time": "02:21 น.",
    "sender": "นาย วินฉลิม แก้นนี",  // ← เป็น string!
    "receiver_name": "บจก. ทินเดอร์ โซลูชั่น",
    "sender_bank": "นายวินฉลิม แก้นนี",
    "receiver_bank": "ธนาคารกสิกรไทย"
  }
}
```

### Template Flex Message (ที่ควรเป็น)
```json
{
  "type": "bubble",
  "body": {
    "type": "box",
    "layout": "vertical",
    "contents": [
      {
        "type": "text",
        "text": "{{amount}}",  // ← ใช้ placeholder
        "size": "xxl"
      }
    ]
  }
}
```

## ตัวแปรที่ใช้ได้

จากข้อมูลจริงที่ได้จาก Thunder API:
- `{{amount}}` - จำนวนเงิน
- `{{sender}}` - ชื่อผู้โอน (string)
- `{{receiver_name}}` - ชื่อผู้รับ
- `{{sender_bank}}` - ธนาคารผู้โอน
- `{{receiver_bank}}` - ธนาคารผู้รับ
- `{{date}}` - วันที่
- `{{time}}` - เวลา
- `{{transRef}}` - เลขอ้างอิง
