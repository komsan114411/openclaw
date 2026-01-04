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
    echo 📋 TASK.md - มีงานรอทำ
)

:: Check READY_FOR_REVIEW.md
if exist "%HANDOFF_DIR%\READY_FOR_REVIEW.md" (
    echo 🔨 READY_FOR_REVIEW.md - Developer เสร็จแล้ว รอ Review
    echo.
    echo 📬 กรุณาสั่ง Reviewer AI:
    echo ────────────────────────────────────────
    echo อ่าน .ai/handoff/READY_FOR_REVIEW.md แล้ว Review
    echo ────────────────────────────────────────
)

:: Check REVIEW_FEEDBACK.md
if exist "%HANDOFF_DIR%\REVIEW_FEEDBACK.md" (
    echo 🔍 REVIEW_FEEDBACK.md - Reviewer ให้ Feedback แล้ว
    echo.
    echo 📬 กรุณาสั่ง Developer AI:
    echo ────────────────────────────────────────
    echo อ่าน .ai/handoff/REVIEW_FEEDBACK.md แล้วแก้ไข
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
    echo สร้าง TASK.md ใหม่เพื่อเริ่มงานถัดไป
)

:: Check if no files exist
if not exist "%HANDOFF_DIR%\TASK.md" (
    if not exist "%HANDOFF_DIR%\READY_FOR_REVIEW.md" (
        if not exist "%HANDOFF_DIR%\REVIEW_FEEDBACK.md" (
            if not exist "%HANDOFF_DIR%\APPROVED.md" (
                echo ⏳ ไม่มีงาน - รัน create-task.bat เพื่อสร้างงานใหม่
            )
        )
    )
)

echo.
echo ⏳ Checking again in %CHECK_INTERVAL%s... (Ctrl+C to stop)
timeout /t %CHECK_INTERVAL% /nobreak >nul
goto loop
