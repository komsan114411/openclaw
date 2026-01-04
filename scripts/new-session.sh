#!/bin/bash
# =============================================================================
# new-session.sh - Create new AI handoff session
# =============================================================================
# สร้างไฟล์ handoff ใหม่จาก template พร้อมใส่วันที่อัตโนมัติ
# =============================================================================

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
AI_DIR="$PROJECT_ROOT/.ai"
SESSIONS_DIR="$AI_DIR/sessions"
TEMPLATE="$AI_DIR/handoff_template.md"

# Create directories if needed
mkdir -p "$SESSIONS_DIR"

# Generate filename
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M")
TASK_NAME="${1:-session}"
FILENAME="${TIMESTAMP}_${TASK_NAME}.md"
FILEPATH="$SESSIONS_DIR/$FILENAME"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     📝 NEW AI SESSION                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Create from template or default
if [ -f "$TEMPLATE" ]; then
    # Replace placeholders
    sed "s/\[AUTO\]/$(date '+%Y-%m-%d %H:%M')/g" "$TEMPLATE" > "$FILEPATH"
else
    # Create default content
    cat > "$FILEPATH" << 'EOF'
# 🔄 AI Session Handoff

## Session Info
- Date: [DATE]
- Duration: [เวลาที่ทำงาน]
- AI Model: Claude

## 📋 Tasks Completed
- [ ] Task 1
- [ ] Task 2

## 📁 Files Changed
| File | Change Type | Description |
|------|-------------|-------------|
| path/to/file | Modified | อธิบายการเปลี่ยนแปลง |

## ⚠️ Known Issues
- Issue 1: รายละเอียด

## 🔜 Next Steps
1. สิ่งที่ต้องทำต่อ
2. ...

## 💡 Context & Notes
ข้อมูลสำคัญที่ AI ตัวต่อไปควรรู้

## 🧪 How to Verify
วิธีตรวจสอบว่างานที่ทำเสร็จถูกต้อง
EOF
    # Replace date placeholder
    sed -i "s/\[DATE\]/$(date '+%Y-%m-%d %H:%M')/g" "$FILEPATH" 2>/dev/null || \
    sed "s/\[DATE\]/$(date '+%Y-%m-%d %H:%M')/g" "$FILEPATH" > "$FILEPATH.tmp" && mv "$FILEPATH.tmp" "$FILEPATH"
fi

echo -e "${GREEN}✅ Created: $FILEPATH${NC}"
echo ""
echo -e "${YELLOW}💡 Next steps:${NC}"
echo "   1. Fill in the handoff document"
echo "   2. Update .ai/CURRENT_CONTEXT.md"
echo "   3. Commit and push"
echo ""

# Try to open in editor
if command -v code &> /dev/null; then
    code "$FILEPATH"
    echo -e "${GREEN}📝 Opened in VS Code${NC}"
elif command -v nano &> /dev/null; then
    nano "$FILEPATH"
elif command -v vim &> /dev/null; then
    vim "$FILEPATH"
fi
