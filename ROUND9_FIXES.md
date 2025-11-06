# Round 9 Fixes - Technical Documentation

## Overview
แก้ไขปัญหา 3 ข้อตามที่ผู้ใช้รายงาน:
1. สลิปซ้ำให้แสดงรายละเอียดทั้งหมดพร้อมบล็อกเตือน
2. หน้าแชทให้แสดงรายละเอียดทั้งหมดไม่ย่อ
3. เพิ่มตัวกรองและค้นหาในแชท

---

## 1. Duplicate Slip Display

### ปัญหา
- สลิปซ้ำแสดงเป็น Flex Message เดียวพร้อมแถบเตือนด้านบน
- ผู้ใช้ต้องการให้แสดงเป็น 2 ข้อความแยก:
  1. บล็อกเตือน (text message)
  2. Flex Message เต็มรูปแบบ

### การแก้ไข

#### 1.1 แก้ไข `main.py` - `send_slip_result()`

**ไฟล์:** `/home/ubuntu/test/main.py`  
**บรรทัด:** 1425-1444

```python
if result.get("status") == "duplicate":
    # For duplicate slip: send warning text + flex message
    amount = result.get("amount", 0)
    amount_display = f"฿{amount:,.2f}"
    
    warning_text = f"⚠️ สลิปนี้เคยถูกใช้แล้ว\n💰 ยอดเงิน: {amount_display}"
    
    # Create flex message as "success" (green header)
    result_copy = result.copy()
    result_copy["status"] = "success"
    flex_message = create_beautiful_slip_flex_message(result_copy)
    
    messages = [
        {"type": "text", "text": warning_text},
        flex_message
    ]
elif result.get("status") == "success":
    # Create beautiful flex message for success
    flex_message = create_beautiful_slip_flex_message(result)
    messages = [flex_message]
```

**สิ่งที่เปลี่ยน:**
- แยก case `duplicate` ออกจาก `success`
- สร้างข้อความเตือน (text message) พร้อมยอดเงิน
- สร้าง Flex Message โดยเปลี่ยน status เป็น "success" (header สีเขียว)
- ส่งทั้ง 2 ข้อความในคราวเดียว

#### 1.2 แก้ไข `slip_formatter.py` - ลบ duplicate warning

**ไฟล์:** `/home/ubuntu/test/services/slip_formatter.py`  
**บรรทัด:** 387-390

```python
# No need to add duplicate warning in flex message
# It will be sent as a separate text message

return {"type": "flex", "altText": f"{badge_text} {amount_display}", "contents": bubble}
```

**สิ่งที่เปลี่ยน:**
- ลบโค้ดที่เพิ่มแถบเตือน "สลิปใช้งานซ้ำ" ใน Flex Message
- Flex Message จะแสดงเหมือนสลิปปกติ (สีเขียว)

### ผลลัพธ์
- สลิปซ้ำจะแสดง 2 ข้อความ:
  1. ⚠️ สลิปนี้เคยถูกใช้แล้ว + 💰 ยอดเงิน
  2. Flex Message เต็มรูปแบบ (สีเขียว)

---

## 2. Full Message Display in Chat

### ปัญหา
- ข้อความอาจจะถูกย่อ (text-overflow: ellipsis)
- รูปภาพอาจจะแสดงไม่เต็ม (max-width: 300px)

### การแก้ไข

#### 2.1 แก้ไข CSS ของ `.message-text`

**ไฟล์:** `/home/ubuntu/test/templates/settings/realtime_chat.html`  
**บรรทัด:** 328-334

```css
.message-text {
    font-size: var(--font-size-base);
    line-height: 1.5;
    margin: 0;
    white-space: pre-wrap;
    word-wrap: break-word;
}
```

**สิ่งที่เพิ่ม:**
- `white-space: pre-wrap;` - รักษา line breaks และ wrap ข้อความ
- `word-wrap: break-word;` - ตัดคำยาวๆ ให้พอดี

#### 2.2 แก้ไข CSS ของ `.message-image`

**ไฟล์:** `/home/ubuntu/test/templates/settings/realtime_chat.html`  
**บรรทัด:** 336-343

```css
.message-image {
    max-width: 100%;
    width: auto;
    border-radius: var(--radius-md);
    overflow: hidden;
    cursor: pointer;
    margin-top: var(--spacing-xs);
}
```

**สิ่งที่เปลี่ยน:**
- `max-width: 300px` → `max-width: 100%`
- เพิ่ม `width: auto;`

### ผลลัพธ์
- ข้อความแสดงเต็มไม่ย่อ
- รูปภาพแสดงเต็มความกว้างของ chat bubble

---

## 3. Filter and Search in Chat

### ปัญหา
- ไม่มีตัวกรองข้อความ/รูป/วิดีโอ
- ไม่มีการค้นหาในแชท

### การแก้ไข

#### 3.1 เพิ่ม UI ใน Chat Header

**ไฟล์:** `/home/ubuntu/test/templates/settings/realtime_chat.html`  
**บรรทัด:** 519-536

```html
<div class="chat-header-actions">
    <input type="text" id="searchInChat" placeholder="🔍 ค้นหาในแชท..." style="display: none;">
    <button class="filter-btn" id="searchBtn" title="ค้นหา">
        <i class="fas fa-search"></i>
    </button>
    <button class="filter-btn" data-filter="all" title="ทั้งหมด">
        <i class="fas fa-list"></i>
    </button>
    <button class="filter-btn" data-filter="text" title="ข้อความ">
        <i class="fas fa-comment"></i>
    </button>
    <button class="filter-btn" data-filter="image" title="รูปภาพ">
        <i class="fas fa-image"></i>
    </button>
    <button class="filter-btn" data-filter="video" title="วิดีโอ">
        <i class="fas fa-video"></i>
    </button>
</div>
```

**สิ่งที่เพิ่ม:**
- Search input (ซ่อนไว้ตอนเริ่มต้น)
- ปุ่มค้นหา (toggle search box)
- ปุ่มกรอง: ทั้งหมด / ข้อความ / รูปภาพ / วิดีโอ

#### 3.2 เพิ่ม CSS สำหรับ Filter Buttons

**ไฟล์:** `/home/ubuntu/test/templates/settings/realtime_chat.html`  
**บรรทัด:** 226-268

```css
.chat-header-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
}

#searchInChat {
    padding: 8px 12px;
    border: 1px solid var(--gray-300);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    width: 200px;
    transition: all 0.3s ease;
}

#searchInChat:focus {
    outline: none;
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
}

.filter-btn {
    background: var(--white);
    border: 1px solid var(--gray-300);
    border-radius: var(--radius-md);
    padding: 8px 12px;
    cursor: pointer;
    transition: all 0.3s ease;
    color: var(--gray-600);
    font-size: var(--font-size-base);
}

.filter-btn:hover {
    background: var(--gray-100);
    border-color: var(--primary-color);
    color: var(--primary-color);
}

.filter-btn.active {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: var(--white);
}
```

#### 3.3 เพิ่ม JavaScript สำหรับ Filter และ Search

**ไฟล์:** `/home/ubuntu/test/templates/settings/realtime_chat.html`  
**บรรทัด:** 987-1052

```javascript
// Search in chat toggle
document.getElementById('searchBtn').addEventListener('click', function() {
    const searchInput = document.getElementById('searchInChat');
    if (searchInput.style.display === 'none') {
        searchInput.style.display = 'block';
        searchInput.focus();
    } else {
        searchInput.style.display = 'none';
        searchInput.value = '';
        filterMessages('all', '');
    }
});

// Search in chat
document.getElementById('searchInChat').addEventListener('input', function(e) {
    const query = e.target.value;
    const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
    filterMessages(activeFilter, query);
});

// Filter buttons
document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
    btn.addEventListener('click', function() {
        // Remove active class from all filter buttons
        document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
        // Add active class to clicked button
        this.classList.add('active');
        
        const filter = this.dataset.filter;
        const query = document.getElementById('searchInChat').value;
        filterMessages(filter, query);
    });
});

// Set default active filter
document.querySelector('.filter-btn[data-filter="all"]')?.classList.add('active');

// Filter messages function
function filterMessages(type, searchQuery = '') {
    const messages = document.querySelectorAll('.message');
    
    messages.forEach(msg => {
        let show = true;
        
        // Filter by type
        if (type !== 'all') {
            const hasText = msg.querySelector('.message-text');
            const hasImage = msg.querySelector('.message-image');
            const hasVideo = msg.querySelector('video');
            
            if (type === 'text' && !hasText) show = false;
            if (type === 'image' && !hasImage) show = false;
            if (type === 'video' && !hasVideo) show = false;
        }
        
        // Filter by search query
        if (searchQuery && show) {
            const text = msg.textContent.toLowerCase();
            if (!text.includes(searchQuery.toLowerCase())) {
                show = false;
            }
        }
        
        msg.style.display = show ? 'flex' : 'none';
    });
}
```

**ฟังก์ชันที่เพิ่ม:**
1. **Search Toggle** - คลิกปุ่มค้นหาเพื่อแสดง/ซ่อน search box
2. **Search Input** - ค้นหาแบบ real-time
3. **Filter Buttons** - กรองข้อความตามประเภท
4. **Filter Messages** - ฟังก์ชันหลักสำหรับกรองและค้นหา

### ผลลัพธ์
- มีปุ่มค้นหาและกรองใน chat header
- กรองได้ 4 ประเภท: ทั้งหมด / ข้อความ / รูปภาพ / วิดีโอ
- ค้นหาได้แบบ real-time
- รองรับการกรองและค้นหาพร้อมกัน

---

## Files Changed

### 1. `/home/ubuntu/test/main.py`
- แก้ไข `send_slip_result()` สำหรับสลิปซ้ำ

### 2. `/home/ubuntu/test/services/slip_formatter.py`
- ลบ duplicate warning จาก Flex Message

### 3. `/home/ubuntu/test/templates/settings/realtime_chat.html`
- แก้ไข CSS สำหรับแสดงข้อความและรูปเต็ม
- เพิ่ม UI สำหรับกรองและค้นหา
- เพิ่ม JavaScript สำหรับกรองและค้นหา

---

## Testing Checklist

### 1. Duplicate Slip
- [ ] ส่งสลิปใหม่ → ได้ Flex Message สีเขียว
- [ ] ส่งสลิปซ้ำ → ได้ 2 ข้อความ:
  - [ ] ข้อความเตือน "⚠️ สลิปนี้เคยถูกใช้แล้ว" + ยอดเงิน
  - [ ] Flex Message เต็มรูปแบบ (สีเขียว)

### 2. Full Message Display
- [ ] ข้อความยาวแสดงเต็ม (ไม่ย่อ)
- [ ] รูปภาพแสดงเต็มความกว้าง
- [ ] Flex Message แสดงเต็ม

### 3. Filter and Search
- [ ] คลิกปุ่มค้นหา → แสดง search box
- [ ] พิมพ์ค้นหา → กรองข้อความ
- [ ] คลิก "ทั้งหมด" → แสดงทั้งหมด
- [ ] คลิก "ข้อความ" → แสดงเฉพาะข้อความ
- [ ] คลิก "รูปภาพ" → แสดงเฉพาะรูปภาพ
- [ ] คลิก "วิดีโอ" → แสดงเฉพาะวิดีโอ
- [ ] กรอง + ค้นหา → ทำงานร่วมกัน

---

## Deployment

```bash
git push heroku main
```

**ไม่ต้อง:**
- ❌ Migrate database
- ❌ เพิ่ม dependencies
- ❌ เปลี่ยน environment variables

---

## Commit

```
af39505 - Round 9: Fix duplicate slip display, full message display, and add filter/search in chat
```

**Date:** November 6, 2025  
**Branch:** main  
**Files Changed:** 3  
**Insertions:** 154  
**Deletions:** 27
