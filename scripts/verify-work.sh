#!/bin/bash
# =============================================================================
# verify-work.sh - Quick Health Check
# =============================================================================
# Runs a quick verification that the system is operational:
# 1. Check if Docker containers are running
# 2. Check if API responds to health endpoint
# 3. Check if Frontend is accessible
#
# Exit Codes:
#   0 = All systems operational
#   1 = Docker not running
#   2 = Backend API not responding
#   3 = Frontend not responding
#
# Usage: ./verify-work.sh [--docker|--api|--frontend|--all]
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
HEALTH_ENDPOINT="${HEALTH_ENDPOINT:-/health}"

# Get paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default to all checks
TARGET="${1:---all}"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         SYSTEM HEALTH CHECK            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# Check Docker Containers
# =============================================================================
check_docker() {
    echo -e "${CYAN}[1] Checking Docker...${NC}"

    # Check if Docker is running
    if ! command -v docker &> /dev/null; then
        echo -e "${YELLOW}⚠ Docker not installed (skipping container check)${NC}"
        return 0
    fi

    if ! docker info &> /dev/null; then
        echo -e "${RED}✗ Docker daemon not running${NC}"
        return 1
    fi

    echo -e "${GREEN}✓ Docker daemon is running${NC}"

    # Check for project containers
    cd "$PROJECT_ROOT"

    if [ -f "docker-compose.yml" ]; then
        RUNNING=$(docker-compose ps --services --filter "status=running" 2>/dev/null | wc -l)
        TOTAL=$(docker-compose ps --services 2>/dev/null | wc -l)

        if [ "$TOTAL" -gt 0 ]; then
            if [ "$RUNNING" -eq "$TOTAL" ]; then
                echo -e "${GREEN}✓ All containers running ($RUNNING/$TOTAL)${NC}"
            else
                echo -e "${YELLOW}⚠ Some containers not running ($RUNNING/$TOTAL)${NC}"
                docker-compose ps
            fi
        else
            echo -e "${YELLOW}⚠ No containers defined in docker-compose.yml${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ No docker-compose.yml found${NC}"
    fi

    return 0
}

# =============================================================================
# Check Backend API
# =============================================================================
check_api() {
    echo -e "${CYAN}[2] Checking Backend API...${NC}"
    echo -e "    URL: ${BACKEND_URL}${HEALTH_ENDPOINT}"

    # Try health endpoint
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        --connect-timeout 5 \
        --max-time 10 \
        "${BACKEND_URL}${HEALTH_ENDPOINT}" 2>/dev/null)

    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ Backend API responding (HTTP $HTTP_CODE)${NC}"

        # Get health details if available
        HEALTH_RESPONSE=$(curl -s --max-time 5 "${BACKEND_URL}${HEALTH_ENDPOINT}" 2>/dev/null)
        if [ -n "$HEALTH_RESPONSE" ]; then
            echo -e "    Response: $HEALTH_RESPONSE"
        fi
        return 0
    elif [ "$HTTP_CODE" = "000" ]; then
        echo -e "${RED}✗ Backend API not reachable (connection failed)${NC}"
        echo -e "${YELLOW}  Hint: Is the backend server running?${NC}"
        return 2
    else
        echo -e "${YELLOW}⚠ Backend API returned HTTP $HTTP_CODE${NC}"
        return 0  # Non-200 might still be "working"
    fi
}

# =============================================================================
# Check Frontend
# =============================================================================
check_frontend() {
    echo -e "${CYAN}[3] Checking Frontend...${NC}"
    echo -e "    URL: ${FRONTEND_URL}"

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        --connect-timeout 5 \
        --max-time 10 \
        "${FRONTEND_URL}" 2>/dev/null)

    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "304" ]; then
        echo -e "${GREEN}✓ Frontend responding (HTTP $HTTP_CODE)${NC}"
        return 0
    elif [ "$HTTP_CODE" = "000" ]; then
        echo -e "${RED}✗ Frontend not reachable (connection failed)${NC}"
        echo -e "${YELLOW}  Hint: Is the frontend dev server running?${NC}"
        return 3
    else
        echo -e "${YELLOW}⚠ Frontend returned HTTP $HTTP_CODE${NC}"
        return 0
    fi
}

# =============================================================================
# Check Processes (Alternative to Docker)
# =============================================================================
check_processes() {
    echo -e "${CYAN}[4] Checking Node Processes...${NC}"

    # Check for running node processes
    NODE_PROCS=$(pgrep -f "node" 2>/dev/null | wc -l)

    if [ "$NODE_PROCS" -gt 0 ]; then
        echo -e "${GREEN}✓ Found $NODE_PROCS Node.js process(es)${NC}"

        # Show relevant processes
        if command -v pgrep &> /dev/null; then
            echo -e "${YELLOW}  Running Node processes:${NC}"
            ps aux | grep -E "(next|nest|node)" | grep -v grep | head -5
        fi
    else
        echo -e "${YELLOW}⚠ No Node.js processes detected${NC}"
    fi

    return 0
}

# =============================================================================
# Main Execution
# =============================================================================
RESULT=0

case "$TARGET" in
    --docker)
        check_docker || RESULT=$?
        ;;
    --api)
        check_api || RESULT=$?
        ;;
    --frontend)
        check_frontend || RESULT=$?
        ;;
    --all)
        check_docker || RESULT=$?
        echo ""
        check_api || RESULT=$?
        echo ""
        check_frontend || RESULT=$?
        echo ""
        check_processes
        ;;
    *)
        echo -e "${RED}Unknown option: $TARGET${NC}"
        echo "Usage: ./verify-work.sh [--docker|--api|--frontend|--all]"
        exit 99
        ;;
esac

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${BLUE}════════════════════════════════════════${NC}"

if [ $RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ HEALTH CHECK PASSED${NC}"
else
    echo -e "${RED}✗ HEALTH CHECK FAILED (Code: $RESULT)${NC}"
    case $RESULT in
        1) echo -e "${YELLOW}  Issue: Docker not running${NC}" ;;
        2) echo -e "${YELLOW}  Issue: Backend API not responding${NC}" ;;
        3) echo -e "${YELLOW}  Issue: Frontend not responding${NC}" ;;
    esac
fi

echo -e "${BLUE}════════════════════════════════════════${NC}"

exit $RESULT
