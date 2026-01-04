#!/bin/bash
# =============================================================================
# test-and-fix.sh - The "Ralph Wiggum" Loop
# =============================================================================
# This script runs the test suite and outputs structured error codes
# that tell AI agents how to respond:
#
# Exit Codes:
#   0   = All tests passed (SUCCESS)
#   10  = Frontend TypeScript errors (AI: Read errors -> Fix types -> Retry)
#   11  = Frontend test failures (AI: Read failing tests -> Fix code -> Retry)
#   20  = Backend TypeScript errors (AI: Read errors -> Fix types -> Retry)
#   21  = Backend test failures (AI: Read failing tests -> Fix code -> Retry)
#   99  = Unknown error
#
# Usage: ./test-and-fix.sh [frontend|backend|all]
# =============================================================================

set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Get paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default to running all
TARGET="${1:-all}"

# Error log file for AI to read
ERROR_LOG="$PROJECT_ROOT/.ai/last_error.log"
mkdir -p "$PROJECT_ROOT/.ai"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     TEST AND FIX (Ralph Wiggum Loop)   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# Frontend Tests
# =============================================================================
run_frontend_tests() {
    echo -e "${CYAN}[FRONTEND] Running TypeScript check...${NC}"
    cd "$PROJECT_ROOT/frontend"

    # TypeScript check
    if ! npx tsc --noEmit 2>&1 | tee "$ERROR_LOG"; then
        echo ""
        echo -e "${RED}╔════════════════════════════════════════╗${NC}"
        echo -e "${RED}║  FRONTEND TYPESCRIPT ERROR (Code: 10)  ║${NC}"
        echo -e "${RED}╚════════════════════════════════════════╝${NC}"
        echo -e "${YELLOW}AI INSTRUCTION: Read $ERROR_LOG -> Fix type errors -> Retry${NC}"
        return 10
    fi
    echo -e "${GREEN}✓ Frontend TypeScript OK${NC}"

    # Run tests if they exist
    if [ -f "package.json" ] && grep -q '"test"' package.json; then
        echo -e "${CYAN}[FRONTEND] Running tests...${NC}"
        if ! npm test 2>&1 | tee "$ERROR_LOG"; then
            echo ""
            echo -e "${RED}╔════════════════════════════════════════╗${NC}"
            echo -e "${RED}║   FRONTEND TEST FAILURE (Code: 11)     ║${NC}"
            echo -e "${RED}╚════════════════════════════════════════╝${NC}"
            echo -e "${YELLOW}AI INSTRUCTION: Read failing tests -> Fix code -> Retry${NC}"
            return 11
        fi
        echo -e "${GREEN}✓ Frontend tests passed${NC}"
    else
        echo -e "${YELLOW}⚠ No frontend tests configured${NC}"
    fi

    return 0
}

# =============================================================================
# Backend Tests
# =============================================================================
run_backend_tests() {
    echo -e "${CYAN}[BACKEND] Running TypeScript check...${NC}"
    cd "$PROJECT_ROOT/backend"

    # TypeScript check
    if ! npx tsc --noEmit 2>&1 | tee "$ERROR_LOG"; then
        echo ""
        echo -e "${RED}╔════════════════════════════════════════╗${NC}"
        echo -e "${RED}║   BACKEND TYPESCRIPT ERROR (Code: 20)  ║${NC}"
        echo -e "${RED}╚════════════════════════════════════════╝${NC}"
        echo -e "${YELLOW}AI INSTRUCTION: Read $ERROR_LOG -> Fix type errors -> Retry${NC}"
        return 20
    fi
    echo -e "${GREEN}✓ Backend TypeScript OK${NC}"

    # Run tests if they exist
    if [ -f "package.json" ] && grep -q '"test"' package.json; then
        echo -e "${CYAN}[BACKEND] Running tests...${NC}"
        if ! npm test 2>&1 | tee "$ERROR_LOG"; then
            echo ""
            echo -e "${RED}╔════════════════════════════════════════╗${NC}"
            echo -e "${RED}║    BACKEND TEST FAILURE (Code: 21)     ║${NC}"
            echo -e "${RED}╚════════════════════════════════════════╝${NC}"
            echo -e "${YELLOW}AI INSTRUCTION: Read failing tests -> Fix code -> Retry${NC}"
            return 21
        fi
        echo -e "${GREEN}✓ Backend tests passed${NC}"
    else
        echo -e "${YELLOW}⚠ No backend tests configured${NC}"
    fi

    return 0
}

# =============================================================================
# Main Execution
# =============================================================================
FRONTEND_RESULT=0
BACKEND_RESULT=0

case "$TARGET" in
    frontend)
        run_frontend_tests
        FRONTEND_RESULT=$?
        ;;
    backend)
        run_backend_tests
        BACKEND_RESULT=$?
        ;;
    all)
        echo -e "${BLUE}Running all tests...${NC}"
        echo ""

        run_frontend_tests
        FRONTEND_RESULT=$?

        if [ $FRONTEND_RESULT -eq 0 ]; then
            echo ""
            run_backend_tests
            BACKEND_RESULT=$?
        fi
        ;;
    *)
        echo -e "${RED}Unknown target: $TARGET${NC}"
        echo "Usage: ./test-and-fix.sh [frontend|backend|all]"
        exit 99
        ;;
esac

# =============================================================================
# Final Result
# =============================================================================
echo ""

if [ $FRONTEND_RESULT -ne 0 ]; then
    exit $FRONTEND_RESULT
fi

if [ $BACKEND_RESULT -ne 0 ]; then
    exit $BACKEND_RESULT
fi

# All passed!
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         ALL TESTS PASSED! 🎉           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"

# Clean up error log on success
rm -f "$ERROR_LOG"

exit 0
