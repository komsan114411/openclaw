# 🐛 การวิเคราะห์บั๊ก Round 3

## ปัญหาที่พบ

### 1. ❌ ฟังก์ชัน send_slip_result ส่งข้อมูลผิด
**ปัญหา**: ส่ง `result.get("data", {})` แทน `result` ทำให้ `status` สูญหาย  
**ผลกระทบ**: ไม่สามารถตรวจสอบ status เพื่อเลือก template ได้  
**ตำแหน่ง**: `main.py` ฟังก์ชัน `render_flex_template()` และ `render_slip_template()`

### 2. ❌ ไม่มีการใช้ template ที่เลือกจากหน้าเว็บ
**ปัญหา**: ระบบไม่ได้ดึง `slip_template_id` จาก settings มาใช้  
**ผลกระทบ**: เลือก template ในหน้าเว็บแล้วไม่มีผล ยังใช้ default template  
**ตำแหน่ง**: `main.py` ฟังก์ชัน `handle_image_message()` และ `send_slip_result()`

### 3. ❌ ไม่มี API สำหรับ preview template
**ปัญหา**: ไม่มี endpoint สำหรับดู preview ของ template  
**ผลกระทบ**: ไม่สามารถแสดงตัวอย่าง Flex Message จริงๆ ได้  
**ตำแหน่ง**: ยังไม่มี API route

### 4. ❌ ไม่มีการสร้าง Flex Message จาก custom template
**ปัญหา**: ฟังก์ชัน `create_beautiful_slip_flex_message` ไม่รับ `template_id`  
**ผลกระทบ**: ไม่สามารถใช้ custom template ได้  
**ตำแหน่ง**: `services/slip_formatter.py`

---

## แผนการแก้ไข

### Fix #1: แก้ไขการส่งข้อมูลใน render functions
```python
# เปลี่ยนจาก
data = result.get("data", {}) or {}

# เป็น
data = result if isinstance(result, dict) else {}
if "data" in result:
    data = result["data"]
```

### Fix #2: เพิ่มการดึง slip_template_id
```python
# ใน handle_image_message
slip_template_id = settings.get("slip_template_id")
await send_slip_result(user_id, result, access_token, channel_id, slip_template_id)

# ใน send_slip_result
async def send_slip_result(..., slip_template_id: Optional[str] = None):
    if slip_template_id:
        template = app.state.slip_template_model.get_template_by_id(slip_template_id)
    else:
        template = app.state.slip_template_model.get_default_template(channel_id)
```

### Fix #3: สร้าง API preview template
```python
@app.get("/api/user/line-accounts/{account_id}/slip-templates/{template_id}/preview")
async def preview_template(account_id: str, template_id: str):
    # ดึง template
    # สร้าง sample data
    # Render template
    # Return preview
```

### Fix #4: แก้ไข create_beautiful_slip_flex_message
```python
def create_beautiful_slip_flex_message(result: dict, template_id: Optional[str] = None, db=None) -> dict:
    if template_id and db:
        # ดึง custom template
        template = db.slip_templates.find_one({"_id": ObjectId(template_id)})
        if template and template.get("template_flex"):
            # ใช้ custom template
            return render_flex_template(template["template_flex"], result)
    
    # ใช้ default template
    return default_flex_message
```

---

## ลำดับการแก้ไข

1. แก้ไข `render_flex_template()` และ `render_slip_template()` ให้รับ `result` แทน `result["data"]`
2. เพิ่มการดึง `slip_template_id` ใน `handle_image_message()`
3. แก้ไข `send_slip_result()` ให้รับและใช้ `slip_template_id`
4. แก้ไข `create_beautiful_slip_flex_message()` ให้รับ `template_id`
5. สร้าง API `/preview` สำหรับ preview template
6. อัปเดต UI ให้เรียกใช้ API preview

---

**สถานะ**: 🔧 กำลังแก้ไข
