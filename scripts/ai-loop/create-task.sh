#!/bin/bash

# 📝 Create New Task - สร้างงานใหม่สำหรับ AI Loop

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
HANDOFF_DIR="$PROJECT_DIR/.ai/handoff"

mkdir -p "$HANDOFF_DIR"

# Clean old files
rm -f "$HANDOFF_DIR/READY_FOR_REVIEW.md"
rm -f "$HANDOFF_DIR/REVIEW_FEEDBACK.md"
rm -f "$HANDOFF_DIR/APPROVED.md"

# Create task file
cat > "$HANDOFF_DIR/TASK.md" << 'EOF'
# 📋 New Task

## 🎯 Objective
[อธิบายเป้าหมาย]

## 📝 Requirements
1. [ข้อกำหนด 1]
2. [ข้อกำหนด 2]
3. [ข้อกำหนด 3]

## 📁 Files to Modify
- [ ] path/to/file1.ts
- [ ] path/to/file2.ts

## ⚠️ Constraints
- [ข้อจำกัด]

## 🧪 Acceptance Criteria
- [ ] [เงื่อนไขที่ต้องผ่าน 1]
- [ ] [เงื่อนไขที่ต้องผ่าน 2]

## ⏰ Created
[timestamp]
EOF

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
sed -i "s/\[timestamp\]/$TIMESTAMP/" "$HANDOFF_DIR/TASK.md" 2>/dev/null || true

echo "✅ Created: $HANDOFF_DIR/TASK.md"
echo "📝 กรุณาแก้ไขไฟล์แล้วสั่ง Developer AI เริ่มงาน"

# Open in editor (optional)
if command -v code &> /dev/null; then
    code "$HANDOFF_DIR/TASK.md"
elif command -v nano &> /dev/null; then
    nano "$HANDOFF_DIR/TASK.md"
fi
