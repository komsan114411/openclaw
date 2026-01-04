@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title AI Development Loop - Monitor

set "HANDOFF_DIR=.ai\handoff"
if not exist "%HANDOFF_DIR%" mkdir "%HANDOFF_DIR%"

:loop
cls
echo ========================================
echo    AI DEVELOPMENT LOOP - MONITOR
echo ========================================
echo.
echo Status: %date% %time%
echo.

if exist "%HANDOFF_DIR%\TASK.md" (
    if not exist "%HANDOFF_DIR%\READY_FOR_REVIEW.md" (
        if not exist "%HANDOFF_DIR%\REVIEW_FEEDBACK.md" (
            echo [TASK] Waiting for Developer
        )
    )
)

if exist "%HANDOFF_DIR%\READY_FOR_REVIEW.md" (
    echo [REVIEW] Ready for Review
    echo.
    echo Command for Reviewer AI:
    echo "Read .ai/handoff/READY_FOR_REVIEW.md and review"
)

if exist "%HANDOFF_DIR%\REVIEW_FEEDBACK.md" (
    echo [FEEDBACK] Has Feedback - Developer needs to fix
    echo.
    echo Command for Developer AI:
    echo "Read .ai/handoff/REVIEW_FEEDBACK.md and fix"
)

if exist "%HANDOFF_DIR%\APPROVED.md" (
    echo.
    echo ========================================
    echo    TASK COMPLETED SUCCESSFULLY!
    echo ========================================
    del "%HANDOFF_DIR%\APPROVED.md" >nul 2>&1
)

echo.
echo Checking again in 10s... (Ctrl+C to stop)
timeout /t 10 /nobreak >nul
goto loop
