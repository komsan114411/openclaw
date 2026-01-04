#!/bin/bash
# =============================================================================
# safe-push.sh - Lint, Commit, and Push with Safety Checks
# =============================================================================
# Usage: ./safe-push.sh "commit message"
#
# ขั้นตอน:
# 1. รัน npm run lint ใน frontend/
# 2. รัน npm run lint ใน backend/
# 3. ถ้า lint ผ่าน -> git add . && git commit && git push
# 4. ถ้า lint ไม่ผ่าน -> แสดง error และหยุด
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Check for commit message
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: ต้องระบุ commit message${NC}"
    echo "Usage: ./safe-push.sh \"your commit message\""
    exit 1
fi

COMMIT_MSG="$1"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           🚀 SAFE PUSH                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}📝 Commit message:${NC} $COMMIT_MSG"
echo ""

# =============================================================================
# Step 1: Lint Frontend
# =============================================================================
echo -e "${BLUE}[1/4] 🔍 Linting Frontend...${NC}"
cd "$PROJECT_ROOT/frontend"

if npm run lint 2>&1; then
    echo -e "${GREEN}✅ Frontend lint passed${NC}"
else
    echo -e "${RED}❌ Frontend lint FAILED${NC}"
    echo -e "${RED}กรุณาแก้ไข errors ด้านบนก่อน push${NC}"
    exit 1
fi

# =============================================================================
# Step 2: Lint Backend
# =============================================================================
echo ""
echo -e "${BLUE}[2/4] 🔍 Linting Backend...${NC}"
cd "$PROJECT_ROOT/backend"

if npm run lint 2>&1; then
    echo -e "${GREEN}✅ Backend lint passed${NC}"
else
    echo -e "${RED}❌ Backend lint FAILED${NC}"
    echo -e "${RED}กรุณาแก้ไข errors ด้านบนก่อน push${NC}"
    exit 1
fi

# =============================================================================
# Step 3: Git Add & Commit
# =============================================================================
echo ""
echo -e "${BLUE}[3/4] 📦 Committing changes...${NC}"
cd "$PROJECT_ROOT"

git add .

if git diff --cached --quiet; then
    echo -e "${YELLOW}⚠️ ไม่มี changes ที่ต้อง commit${NC}"
    exit 0
fi

git commit -m "$COMMIT_MSG

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

echo -e "${GREEN}✅ Committed successfully${NC}"

# =============================================================================
# Step 4: Git Push
# =============================================================================
echo ""
echo -e "${BLUE}[4/4] 🚀 Pushing to remote...${NC}"

if git push; then
    echo -e "${GREEN}✅ Pushed successfully${NC}"
else
    echo -e "${RED}❌ Push failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         ✅ SAFE PUSH COMPLETE          ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
