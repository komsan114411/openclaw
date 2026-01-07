คุณคือ Senior Software Architect
กรุณาปรับปรุงโครงสร้างระบบเพื่อแก้ปัญหา Circular Dependencies
ที่เกิดจาก module ต่าง ๆ เรียกใช้งานกันไปมาเป็นวงจร

## ปัญหาปัจจุบัน
- Module หลายส่วน (เช่น Member, Payment, Notification)
  เรียกหากันโดยตรง
- เกิดการพึ่งพากันเป็นวงกลม (Circular Dependency)
- แก้ไขจุดหนึ่ง → กระทบหลายระบบโดยไม่ตั้งใจ
- ทดสอบแยก module ไม่ได้ ต้องรันทดสอบทั้งระบบ

## เป้าหมาย
- ตัดการเรียกข้าม module โดยตรง
- ลด coupling ระหว่างระบบย่อย
- ทำให้แต่ละ module เป็นอิสระต่อกัน
- รองรับการขยายระบบในอนาคตได้ง่าย

## แนวคิดหลัก (Concept)
- เปลี่ยนจาก Direct Call → Event-Driven
- ใช้ “Event Bus” เป็นตัวกลาง
- Module ไม่รู้จักกันโดยตรง
- รู้จักแค่ "Event" ที่ประกาศหรือรับฟัง

## วิธีการที่ต้องการ
1. เมื่อ module ใดทำงานเสร็จ
   - ห้ามเรียก module อื่นโดยตรง
   - ให้ emit / publish event แทน
2. Module ที่เกี่ยวข้อง
   - subscribe / listen event ที่สนใจ
   - ทำงานของตัวเองเมื่อ event ถูก trigger
3. Module ต้นทาง
   - ไม่ต้องรู้ว่าใครจะฟัง event นี้
   - ไม่ต้อง import module อื่น

## ตัวอย่าง Event
- UserRegistered
- PaymentCompleted
- SubscriptionActivated
- WalletDebited

## ตัวอย่างสถานการณ์
- Payment Service:
  - publish event: PaymentCompleted
- Member Service:
  - listen PaymentCompleted → activate subscription
- Notification Service:
  - listen PaymentCompleted → send message

โดยที่ Payment Service
- ไม่ import Member
- ไม่ import Notification

## โครงสร้างที่แนะนำ
/core
  └── event-bus.ts
/modules
  └── member
        └── member.handler.ts
  └── payment
        └── payment.service.ts
  └── notification
        └── notification.listener.ts

## ข้อกำหนดทางเทคนิค
- Event Bus ต้อง:
  - เป็นกลาง (ไม่มี business logic)
  - ไม่ผูกกับ module ใด module หนึ่ง
- Event ต้อง:
  - เป็น immutable data
  - ชัดเจนว่าหมายถึงอะไร
- Module ต้อง:
  - สื่อสารผ่าน event เท่านั้น
  - ห้าม import กันโดยตรง

## สิ่งที่ต้องส่งมอบ
- ตัวอย่าง before / after (circular vs event-driven)
- โค้ดตัวอย่าง Event Bus
- ตัวอย่างการ emit และ listen event
- อธิบายว่าการ refactor นี้:
  - ลด coupling อย่างไร
  - ช่วยให้ test ง่ายขึ้นอย่างไร
  - ลดความเสี่ยงระบบล่มได้อย่างไร
- แนะนำ best practice เพิ่มเติม
  (เช่น Domain Event, Clean Architecture, Hexagonal)
