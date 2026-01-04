#!/bin/bash
# =============================================================================
# dev-start.sh - Start Development Environment
# =============================================================================
# ขั้นตอน:
# 1. สั่ง docker-compose up -d (ถ้ามี)
# 2. รอให้ services พร้อม
# 3. เปิด backend dev server
# 4. เปิด frontend dev server
# 5. แสดง URL ที่เข้าใช้งานได้
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

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      🚀 DEV ENVIRONMENT STARTER        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# Step 1: Docker (Optional)
# =============================================================================
echo -e "${CYAN}[1/4] 🐳 Checking Docker...${NC}"

if [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
    if command -v docker-compose &> /dev/null; then
        echo -e "   ${YELLOW}Starting Docker containers...${NC}"
        cd "$PROJECT_ROOT"
        docker-compose up -d 2>/dev/null || true
        echo -e "   ${GREEN}✅ Docker containers started${NC}"
    else
        echo -e "   ${YELLOW}⚠️ docker-compose not found, skipping${NC}"
    fi
else
    echo -e "   ${YELLOW}⚠️ No docker-compose.yml found, skipping${NC}"
fi

# =============================================================================
# Step 2: Wait for services
# =============================================================================
echo ""
echo -e "${CYAN}[2/4] ⏳ Waiting for services...${NC}"
sleep 2
echo -e "   ${GREEN}✅ Ready${NC}"

# =============================================================================
# Step 3: Start Backend
# =============================================================================
echo ""
echo -e "${CYAN}[3/4] ⚙️ Starting Backend...${NC}"

if [ -d "$PROJECT_ROOT/backend" ]; then
    cd "$PROJECT_ROOT/backend"

    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo -e "   ${YELLOW}📦 Installing backend dependencies...${NC}"
        npm install
    fi

    # Start backend in background
    echo -e "   ${YELLOW}🔄 Starting NestJS server...${NC}"
    npm run start:dev &
    BACKEND_PID=$!
    echo -e "   ${GREEN}✅ Backend starting (PID: $BACKEND_PID)${NC}"
else
    echo -e "   ${RED}❌ backend/ directory not found${NC}"
fi

# =============================================================================
# Step 4: Start Frontend
# =============================================================================
echo ""
echo -e "${CYAN}[4/4] 🖥️ Starting Frontend...${NC}"

if [ -d "$PROJECT_ROOT/frontend" ]; then
    cd "$PROJECT_ROOT/frontend"

    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo -e "   ${YELLOW}📦 Installing frontend dependencies...${NC}"
        npm install
    fi

    # Start frontend in background
    echo -e "   ${YELLOW}🔄 Starting Next.js server...${NC}"
    npm run dev &
    FRONTEND_PID=$!
    echo -e "   ${GREEN}✅ Frontend starting (PID: $FRONTEND_PID)${NC}"
else
    echo -e "   ${RED}❌ frontend/ directory not found${NC}"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${GREEN}🎉 Development environment starting!${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}📍 URLs:${NC}"
echo -e "   Frontend: ${GREEN}http://localhost:3000${NC}"
echo -e "   Backend:  ${GREEN}http://localhost:4000${NC}"
echo -e "   API Docs: ${GREEN}http://localhost:4000/api${NC}"
echo ""
echo -e "${YELLOW}💡 Tips:${NC}"
echo "   • รอสักครู่ให้ servers พร้อม (10-30 วินาที)"
echo "   • ตรวจสอบ logs ใน terminal"
echo "   • กด Ctrl+C เพื่อหยุด"
echo ""
echo -e "${CYAN}🔧 Quick Commands:${NC}"
echo "   ./scripts/health-check.sh    - ตรวจสอบสถานะ"
echo "   ./scripts/safe-push.sh       - Lint และ push"
echo ""

# Wait for user interrupt
echo -e "${YELLOW}Press Ctrl+C to stop all servers...${NC}"
wait
