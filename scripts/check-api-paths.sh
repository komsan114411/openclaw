#!/bin/bash
# =============================================================================
# check-api-paths.sh - Scan for incorrect API paths
# =============================================================================
# สแกนไฟล์ใน frontend/ หา pattern ที่เรียก API โดยไม่มี /api prefix
# =============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     🔍 API PATH CHECKER                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Patterns ที่ผิด (ไม่มี /api prefix)
WRONG_PATTERNS=(
    "/chat-messages"
    "/line-accounts"
    "/users"
    "/payments"
    "/packages"
    "/subscriptions"
    "/activity-logs"
    "/system-settings"
    "/slip-templates"
)

# ไฟล์ที่จะไม่ตรวจ
EXCLUDE_PATTERNS="node_modules|.next|dist|build"

ISSUES_FOUND=0
TOTAL_FILES=0

echo -e "${CYAN}📂 Scanning: $FRONTEND_DIR${NC}"
echo ""

for pattern in "${WRONG_PATTERNS[@]}"; do
    # หา pattern ที่ไม่มี /api นำหน้า
    # เช่น fetch('/chat-messages หรือ api.get('/chat-messages

    RESULTS=$(grep -rn --include="*.ts" --include="*.tsx" -E "(fetch|get|post|put|patch|delete)\(['\"\`]${pattern}" "$FRONTEND_DIR/src" 2>/dev/null | grep -vE "$EXCLUDE_PATTERNS" || true)

    if [ -n "$RESULTS" ]; then
        echo -e "${RED}❌ พบ pattern ที่ผิด: ${pattern}${NC}"
        echo "$RESULTS" | while read -r line; do
            echo -e "   ${YELLOW}→${NC} $line"
            ((ISSUES_FOUND++)) || true
        done
        echo ""
    fi
done

# หา hardcoded localhost URLs
echo -e "${CYAN}🔍 Checking for hardcoded URLs...${NC}"
HARDCODED=$(grep -rn --include="*.ts" --include="*.tsx" -E "http://localhost:[0-9]+" "$FRONTEND_DIR/src" 2>/dev/null | grep -vE "$EXCLUDE_PATTERNS|NEXT_PUBLIC" || true)

if [ -n "$HARDCODED" ]; then
    echo -e "${RED}❌ พบ hardcoded URLs:${NC}"
    echo "$HARDCODED" | while read -r line; do
        echo -e "   ${YELLOW}→${NC} $line"
        ((ISSUES_FOUND++)) || true
    done
    echo ""
fi

# Summary
echo -e "${BLUE}════════════════════════════════════════${NC}"

if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✅ ไม่พบ API path ที่ผิด${NC}"
    echo -e "${GREEN}   All API calls look correct!${NC}"
    exit 0
else
    echo -e "${RED}❌ พบ $ISSUES_FOUND ปัญหา${NC}"
    echo ""
    echo -e "${YELLOW}💡 วิธีแก้ไข:${NC}"
    echo "   1. API path ต้องขึ้นต้นด้วย /api/admin/ หรือ /api/liff/"
    echo "   2. ใช้ environment variable แทน hardcoded URL"
    echo ""
    echo -e "${YELLOW}ตัวอย่าง:${NC}"
    echo -e "   ${RED}❌ fetch('/chat-messages/...')${NC}"
    echo -e "   ${GREEN}✅ fetch('/api/admin/chat-messages/...')${NC}"
    exit 1
fi
