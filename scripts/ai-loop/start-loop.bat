@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title AI Development Loop - Monitor

set "PROJECT_DIR=%~dp0..\.."
set "HANDOFF_DIR=%PROJECT_DIR%\.ai\handoff"
set "SESSIONS_DIR=%PROJECT_DIR%\.ai\sessions"
set "CHECK_INTERVAL=10"

:: Create directories
if not exist "%HANDOFF_DIR%" mkdir "%HANDOFF_DIR%"
if not exist "%SESSIONS_DIR%" mkdir "%SESSIONS_DIR%"

:header
cls
echo ╔════════════════════════════════════════════════════════════╗
echo ║           🤖 AI DEVELOPMENT LOOP - STARTED                 ║
echo ╠════════════════════════════════════════════════════════════╣
echo ║  Project: %PROJECT_DIR%
echo ║  Handoff: %HANDOFF_DIR%
echo ║  Interval: %CHECK_INTERVAL%s
echo ╚════════════════════════════════════════════════════════════╝
echo.

:loop
echo ═══ STATUS %date% %time% ═══
echo.

:: Check TASK.md
if exist "%HANDOFF_DIR%\TASK.md" (
    echo 📋 TASK.md - Waiting for Developer
)

:: Check READY_FOR_REVIEW.md
if exist "%HANDOFF_DIR%\READY_FOR_REVIEW.md" (
    echo 🔨 READY_FOR_REVIEW.md - Ready for Review
    echo.
    echo 📬 Run Reviewer AI:
    echo ────────────────────────────────────────
    echo Read .ai/handoff/READY_FOR_REVIEW.md and Review
    echo ────────────────────────────────────────
)

:: Check REVIEW_FEEDBACK.md
if exist "%HANDOFF_DIR%\REVIEW_FEEDBACK.md" (
    echo 🔍 REVIEW_FEEDBACK.md - Has Feedback
    echo.
    echo 📬 Run Developer AI:
    echo ────────────────────────────────────────
    echo Read .ai/handoff/REVIEW_FEEDBACK.md and fix issues
    echo ────────────────────────────────────────
)

:: Check APPROVED.md
if exist "%HANDOFF_DIR%\APPROVED.md" (
    echo.
    echo ╔════════════════════════════════════════╗
    echo ║      🎉 TASK COMPLETED SUCCESSFULLY!   ║
    echo ╚════════════════════════════════════════╝

    :: Archive
    for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set "mydate=%%c%%a%%b"
    for /f "tokens=1-2 delims=: " %%a in ('time /t') do set "mytime=%%a%%b"
    move "%HANDOFF_DIR%\APPROVED.md" "%SESSIONS_DIR%\%mydate%_%mytime%_completed.md" >nul 2>&1

    echo.
    echo Create new TASK.md to start next task
)

:: Check if no files exist
if not exist "%HANDOFF_DIR%\TASK.md" (
    if not exist "%HANDOFF_DIR%\READY_FOR_REVIEW.md" (
        if not exist "%HANDOFF_DIR%\REVIEW_FEEDBACK.md" (
            if not exist "%HANDOFF_DIR%\APPROVED.md" (
                echo ⏳ No task - run create-task.bat to create new task
            )
        )
    )
)

echo.
echo ⏳ Checking again in %CHECK_INTERVAL%s... (Ctrl+C to stop)
timeout /t %CHECK_INTERVAL% /nobreak >nul
goto loop
