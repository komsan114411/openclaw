#!/bin/bash

# 🔍 AI Loop Monitor - แสดงสถานะแบบ Real-time

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
HANDOFF_DIR="$PROJECT_DIR/.ai/handoff"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      🔍 AI LOOP MONITOR                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"

echo -e "\n${YELLOW}📁 Handoff Directory:${NC} $HANDOFF_DIR\n"

echo "Files:"
ls -la "$HANDOFF_DIR" 2>/dev/null || echo "  (empty)"

echo -e "\n${YELLOW}═══ Latest Content ═══${NC}"

for file in TASK.md READY_FOR_REVIEW.md REVIEW_FEEDBACK.md APPROVED.md; do
    if [ -f "$HANDOFF_DIR/$file" ]; then
        echo -e "\n${GREEN}📄 $file:${NC}"
        head -20 "$HANDOFF_DIR/$file"
        echo "..."
    fi
done
