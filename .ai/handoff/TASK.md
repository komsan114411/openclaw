คุณคือ Senior Backend + API Integration Engineer
กรุณาตรวจสอบปัญหา Etherscan API Key (ERC20)
ที่ใส่คีย์ถูกต้องแล้ว แต่ระบบไม่สามารถ:
- กดทดสอบ (Test API) ได้
- บันทึกคีย์ลงระบบได้
- หรือเรียกใช้งานจริงได้

## อาการ (Bug Description)
- Admin ใส่ Etherscan API Key ในหน้า settings
- กด “Test API”
- ระบบแจ้งว่าใช้งานไม่ได้ หรือไม่ response
- บางกรณี:
  - คีย์ไม่ถูกบันทึก
  - reload หน้าแล้วคีย์หาย
  - backend ไม่ใช้คีย์นี้จริงในการเรียก API

## เป้าหมาย
- ทำให้:
  1) API Key บันทึกได้จริง
  2) Test API ใช้งานได้
  3) ระบบนำคีย์ไปใช้เรียก Etherscan ERC20 ได้ถูกต้อง
- ระบุ Root Cause ที่แท้จริง
- แก้ไขให้ใช้งานได้แบบ Production-ready

## ขั้นตอนการตรวจสอบ (ต้องทำครบทุกชั้น)

### 1. Frontend (Admin Settings)
- ตรวจสอบว่า:
  - field Etherscan API Key ถูก bind กับ state จริง
  - payload ที่ส่งไป backend มี api_key จริง
  - ไม่มีการ mask / trim / override คีย์ผิดพลาด
- log payload ก่อนส่ง API
- ตรวจสอบว่า:
  - ปุ่ม Test เรียก endpoint จริง
  - ไม่ใช้ค่าจาก env ฝั่ง frontend แทน DB

### 2. API Endpoint (Test Etherscan)
- ตรวจสอบ endpoint ที่ใช้ทดสอบ เช่น:
  - POST /admin/settings/etherscan/test
- ตรวจสอบ:
  - method ถูกต้อง
  - request body / header ส่ง api_key มาครบ
  - backend ใช้ key จาก request หรือจาก DB จริง

### 3. Backend Logic (Settings Save)
- ตรวจสอบ:
  - API Key ถูก save ลง database จริงหรือไม่
  - column type รองรับ string ยาวพอหรือไม่
  - ไม่มี encryption / hash ที่ทำให้ key ใช้งานไม่ได้
- ตรวจสอบว่า:
  - save แล้ว commit จริง
  - ไม่มี transaction rollback เงียบ ๆ

### 4. Backend Logic (Test API)
- ตรวจสอบว่า:
  - ตอนกด Test:
    - ใช้ key จาก request หรือ DB
    - ไม่ fallback ไปใช้ env เดิม
- ตรวจสอบ URL ที่เรียก:
  - https://api.etherscan.io/api
- ตรวจสอบ params สำหรับ ERC20 เช่น:
  - module=account
  - action=tokentx
  - apikey={API_KEY}

### 5. ตรวจสอบ Response จาก Etherscan
- log response เต็มจาก Etherscan
- ตรวจสอบกรณี:
  - status = "0"
  - message = "NOTOK"
  - error เช่น:
    - Invalid API Key
    - Missing API Key
    - Rate limit exceeded
- แยกแยะว่า:
  - key ผิดจริง
  - หรือระบบส่ง key ไม่ไป

### 6. Network / Environment
- ตรวจสอบว่า:
  - server ออก internet ได้
  - ไม่มี firewall / proxy block api.etherscan.io
- ตรวจสอบ:
  - testnet / mainnet endpoint ถูกต้อง
  - key ถูกใช้กับ network ที่รองรับ

### 7. Cache / Config Override (จุดพลาดบ่อย)
- ตรวจสอบว่า:
  - API Key ถูก cache ไว้หรือไม่
  - save แล้ว cache ไม่ refresh
  - service อ่าน key จาก cache/env แทน DB
- ตรวจสอบ config load order:
  - env > db > cache (หรือผิดลำดับ)

## สิ่งที่ต้องส่งมอบ
- Root Cause ที่แท้จริงว่าทำไม Test ไม่ผ่าน
- จุดที่ key หาย / ไม่ถูกใช้
- โค้ดก่อนแก้ (ถ้ามี)
- โค้ดหลังแก้ (save + test + use)
- แนวทางป้องกัน bug ซ้ำ

## Output Format
1. Root Cause
2. สาเหตุเชิงเทคนิค
3. แนวทางแก้ไข
4. ตัวอย่างโค้ดที่ถูกต้อง
5. Best Practice สำหรับ API Key Management
