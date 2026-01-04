# 🤖 AI Development Loop

ระบบให้ AI 2 ตัวทำงานร่วมกันแบบอัตโนมัติ

## 🚀 Quick Start

### 1. สร้างงานใหม่
```bash
./scripts/ai-loop/create-task.sh
```
แก้ไขไฟล์ `.ai/handoff/TASK.md` ใส่รายละเอียดงาน

### 2. เริ่ม Loop Monitor
```bash
./scripts/ai-loop/start-loop.sh
```

### 3. เปิด 2 Terminal สำหรับ AI

**Terminal 1 - Developer AI:**
```bash
claude
# แล้วสั่ง:
# อ่าน scripts/ai-loop/developer.md และ .ai/handoff/TASK.md แล้วเริ่มทำงาน
```

**Terminal 2 - Reviewer AI:**
```bash
claude
# แล้วสั่ง:
# อ่าน scripts/ai-loop/reviewer.md แล้วรอ Review
```

## 📁 File Flow

```
TASK.md → Developer ทำงาน
    ↓
READY_FOR_REVIEW.md → Reviewer ตรวจ
    ↓
REVIEW_FEEDBACK.md (ถ้าต้องแก้) → กลับไป Developer
    หรือ
APPROVED.md (ถ้าผ่าน) → จบงาน
```

## 📋 Commands

| Command | Description |
|---------|-------------|
| `./create-task.sh` | สร้างงานใหม่ |
| `./start-loop.sh` | เริ่ม Monitor |
| `./monitor.sh` | ดูสถานะ |

## 🔄 Workflow Diagram

```
┌─────────┐     ┌──────────────────┐     ┌──────────┐
│  TASK   │ ──▶ │   DEVELOPER AI   │ ──▶ │  READY   │
│   .md   │     │                  │     │   FOR    │
└─────────┘     │  1. อ่าน TASK    │     │  REVIEW  │
                │  2. เขียนโค้ด    │     │   .md    │
                │  3. ทดสอบ        │     └────┬─────┘
                └──────────────────┘          │
                         ▲                    ▼
                         │          ┌──────────────────┐
                         │          │   REVIEWER AI    │
              ┌────────┴───────┐  │                  │
              │   FEEDBACK     │  │  1. ตรวจโค้ด    │
              │     .md        │◀─│  2. เช็ค Security│
              │  (ถ้าต้องแก้)   │  │  3. ทดสอบ       │
              └────────────────┘  └────────┬─────────┘
                                           │
                                           ▼
                                ┌────────────────┐
                                │   APPROVED     │
                                │     .md        │
                                │   (ถ้าผ่าน)    │
                                └────────────────┘
```

## 📁 Directory Structure

```
scripts/ai-loop/
├── config.json       # ตั้งค่าระบบ
├── start-loop.sh     # Script หลักเริ่มระบบ
├── developer.md      # Prompt สำหรับ Developer AI
├── reviewer.md       # Prompt สำหรับ Reviewer AI
├── monitor.sh        # เฝ้าดูสถานะ
├── create-task.sh    # สร้างงานใหม่
└── README.md         # วิธีใช้งาน (ไฟล์นี้)

.ai/
├── handoff/          # สำหรับส่งงานระหว่าง AI
│   ├── TASK.md
│   ├── READY_FOR_REVIEW.md
│   ├── REVIEW_FEEDBACK.md
│   └── APPROVED.md
└── sessions/         # เก็บประวัติการทำงาน
```

## ⚙️ Configuration

แก้ไข `config.json`:

```json
{
  "project_name": "LINE OA Management",
  "handoff_dir": ".ai/handoff",
  "sessions_dir": ".ai/sessions",
  "check_interval_seconds": 10,
  "max_review_rounds": 5,
  "auto_commit": false,
  "rules_file": "CLAUDE.md",
  "context_file": ".ai/CURRENT_CONTEXT.md"
}
```

## 💡 Tips

1. **ก่อนเริ่ม**: ให้ AI ทั้งสองอ่าน `CLAUDE.md` ก่อนเสมอ
2. **Feedback ชัดเจน**: ระบุไฟล์และ line number ใน feedback
3. **ทดสอบก่อน Approve**: Reviewer ควรรัน build/lint ก่อน approve
4. **Archive**: งานที่เสร็จจะถูกย้ายไป `.ai/sessions/` อัตโนมัติ

---

*Created for LINE OA Management System*
