#!/bin/bash

# 🤖 AI Development Loop - Auto Runner
# ใช้สำหรับเฝ้าดูและประสานงานระหว่าง Developer AI และ Reviewer AI

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
HANDOFF_DIR="$PROJECT_DIR/.ai/handoff"
SESSIONS_DIR="$PROJECT_DIR/.ai/sessions"
CHECK_INTERVAL=10
MAX_ROUNDS=5

# Create directories
mkdir -p "$HANDOFF_DIR"
mkdir -p "$SESSIONS_DIR"

# Header
echo -e "${PURPLE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           🤖 AI DEVELOPMENT LOOP - STARTED                 ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  Project: $PROJECT_DIR"
echo "║  Handoff: $HANDOFF_DIR"
echo "║  Interval: ${CHECK_INTERVAL}s"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Status function
show_status() {
    echo -e "\n${CYAN}═══ STATUS $(date '+%Y-%m-%d %H:%M:%S') ═══${NC}"

    if [ -f "$HANDOFF_DIR/TASK.md" ]; then
        echo -e "${YELLOW}📋 TASK.md${NC} - มีงานรอทำ"
    fi

    if [ -f "$HANDOFF_DIR/READY_FOR_REVIEW.md" ]; then
        echo -e "${BLUE}🔨 READY_FOR_REVIEW.md${NC} - Developer เสร็จแล้ว รอ Review"
    fi

    if [ -f "$HANDOFF_DIR/REVIEW_FEEDBACK.md" ]; then
        echo -e "${RED}🔍 REVIEW_FEEDBACK.md${NC} - Reviewer ให้ Feedback แล้ว"
    fi

    if [ -f "$HANDOFF_DIR/APPROVED.md" ]; then
        echo -e "${GREEN}✅ APPROVED.md${NC} - งานผ่านแล้ว!"
    fi
}

# Main loop
round=0
while true; do
    clear
    show_status

    # Check for APPROVED
    if [ -f "$HANDOFF_DIR/APPROVED.md" ]; then
        echo -e "\n${GREEN}╔════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║      🎉 TASK COMPLETED SUCCESSFULLY!   ║${NC}"
        echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"

        # Archive
        TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
        mv "$HANDOFF_DIR/APPROVED.md" "$SESSIONS_DIR/${TIMESTAMP}_completed.md"

        echo -e "\n${CYAN}Archived to: $SESSIONS_DIR/${TIMESTAMP}_completed.md${NC}"
        echo -e "\n${YELLOW}สร้าง TASK.md ใหม่เพื่อเริ่มงานถัดไป${NC}"
        round=0
    fi

    # Check for READY_FOR_REVIEW
    if [ -f "$HANDOFF_DIR/READY_FOR_REVIEW.md" ]; then
        ((round++)) || true
        echo -e "\n${BLUE}═══ ROUND $round ═══${NC}"
        echo -e "${YELLOW}📬 Developer ส่งงานมาแล้ว กรุณาสั่ง Reviewer AI:${NC}"
        echo -e "${CYAN}────────────────────────────────────────${NC}"
        echo "อ่าน scripts/ai-loop/reviewer.md และ .ai/handoff/READY_FOR_REVIEW.md"
        echo "แล้วทำการ Review"
        echo -e "${CYAN}────────────────────────────────────────${NC}"

        if [ $round -ge $MAX_ROUNDS ]; then
            echo -e "\n${RED}⚠️ เกิน $MAX_ROUNDS รอบแล้ว! กรุณาตรวจสอบด้วยตนเอง${NC}"
        fi
    fi

    # Check for REVIEW_FEEDBACK
    if [ -f "$HANDOFF_DIR/REVIEW_FEEDBACK.md" ]; then
        echo -e "\n${YELLOW}📬 Reviewer ให้ Feedback แล้ว กรุณาสั่ง Developer AI:${NC}"
        echo -e "${CYAN}────────────────────────────────────────${NC}"
        echo "อ่าน scripts/ai-loop/developer.md และ .ai/handoff/REVIEW_FEEDBACK.md"
        echo "แล้วแก้ไขตาม Feedback"
        echo -e "${CYAN}────────────────────────────────────────${NC}"
    fi

    # Check for TASK (new task)
    if [ -f "$HANDOFF_DIR/TASK.md" ] && \
       [ ! -f "$HANDOFF_DIR/READY_FOR_REVIEW.md" ] && \
       [ ! -f "$HANDOFF_DIR/REVIEW_FEEDBACK.md" ]; then
        echo -e "\n${GREEN}📋 มีงานใหม่! กรุณาสั่ง Developer AI:${NC}"
        echo -e "${CYAN}────────────────────────────────────────${NC}"
        echo "อ่าน scripts/ai-loop/developer.md และ .ai/handoff/TASK.md"
        echo "แล้วเริ่มทำงาน"
        echo -e "${CYAN}────────────────────────────────────────${NC}"
    fi

    echo -e "\n${PURPLE}⏳ Checking again in ${CHECK_INTERVAL}s... (Ctrl+C to stop)${NC}"
    sleep $CHECK_INTERVAL
done
