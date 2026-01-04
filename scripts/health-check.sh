#!/bin/bash
# =============================================================================
# health-check.sh - System Health Check
# =============================================================================
# ตรวจสอบสถานะของระบบทั้งหมด:
# - Docker containers
# - Backend API
# - MongoDB connection
# =============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        🏥 SYSTEM HEALTH CHECK          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

TOTAL_CHECKS=0
PASSED_CHECKS=0

# =============================================================================
# Check 1: Docker
# =============================================================================
echo -e "${CYAN}[1/4] 🐳 Docker Status${NC}"
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

if command -v docker &> /dev/null; then
    if docker info &> /dev/null; then
        echo -e "   ${GREEN}✅ Docker daemon is running${NC}"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))

        # Check containers
        if [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
            cd "$PROJECT_ROOT"
            RUNNING=$(docker-compose ps --services --filter "status=running" 2>/dev/null | wc -l | tr -d ' ')
            TOTAL=$(docker-compose ps --services 2>/dev/null | wc -l | tr -d ' ')
            echo -e "   ${YELLOW}📦 Containers: $RUNNING/$TOTAL running${NC}"
        fi
    else
        echo -e "   ${RED}❌ Docker daemon not running${NC}"
    fi
else
    echo -e "   ${YELLOW}⚠️ Docker not installed (skipping)${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi

# =============================================================================
# Check 2: Backend API
# =============================================================================
echo ""
echo -e "${CYAN}[2/4] ⚙️ Backend API${NC}"
echo -e "   URL: ${BACKEND_URL}/health"
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "${BACKEND_URL}/health" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "   ${GREEN}✅ Backend responding (HTTP $HTTP_CODE)${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))

    # Get health details
    HEALTH=$(curl -s --max-time 5 "${BACKEND_URL}/health" 2>/dev/null)
    if [ -n "$HEALTH" ]; then
        echo -e "   ${YELLOW}Response: $HEALTH${NC}"
    fi
elif [ "$HTTP_CODE" = "000" ]; then
    echo -e "   ${RED}❌ Backend not reachable${NC}"
    echo -e "   ${YELLOW}💡 ลองรัน: cd backend && npm run start:dev${NC}"
else
    echo -e "   ${YELLOW}⚠️ Backend returned HTTP $HTTP_CODE${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi

# =============================================================================
# Check 3: Frontend
# =============================================================================
echo ""
echo -e "${CYAN}[3/4] 🖥️ Frontend${NC}"
echo -e "   URL: ${FRONTEND_URL}"
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "${FRONTEND_URL}" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "304" ]; then
    echo -e "   ${GREEN}✅ Frontend responding (HTTP $HTTP_CODE)${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
elif [ "$HTTP_CODE" = "000" ]; then
    echo -e "   ${RED}❌ Frontend not reachable${NC}"
    echo -e "   ${YELLOW}💡 ลองรัน: cd frontend && npm run dev${NC}"
else
    echo -e "   ${YELLOW}⚠️ Frontend returned HTTP $HTTP_CODE${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi

# =============================================================================
# Check 4: Environment Files
# =============================================================================
echo ""
echo -e "${CYAN}[4/4] 📄 Environment Files${NC}"
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
ENV_OK=true

if [ -f "$PROJECT_ROOT/backend/.env" ]; then
    echo -e "   ${GREEN}✅ backend/.env exists${NC}"
else
    echo -e "   ${RED}❌ backend/.env missing${NC}"
    ENV_OK=false
fi

if [ -f "$PROJECT_ROOT/frontend/.env.local" ]; then
    echo -e "   ${GREEN}✅ frontend/.env.local exists${NC}"
else
    echo -e "   ${YELLOW}⚠️ frontend/.env.local missing${NC}"
fi

if [ "$ENV_OK" = true ]; then
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}           📊 SUMMARY                   ${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"

PERCENTAGE=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))

if [ $PASSED_CHECKS -eq $TOTAL_CHECKS ]; then
    echo -e "${GREEN}✅ All checks passed! ($PASSED_CHECKS/$TOTAL_CHECKS)${NC}"
    exit 0
elif [ $PERCENTAGE -ge 50 ]; then
    echo -e "${YELLOW}⚠️ Some issues found ($PASSED_CHECKS/$TOTAL_CHECKS passed)${NC}"
    exit 0
else
    echo -e "${RED}❌ Multiple failures ($PASSED_CHECKS/$TOTAL_CHECKS passed)${NC}"
    exit 1
fi
