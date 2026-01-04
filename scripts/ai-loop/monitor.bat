@echo off
chcp 65001 >nul

set "PROJECT_DIR=%~dp0..\.."
set "HANDOFF_DIR=%PROJECT_DIR%\.ai\handoff"

echo ╔════════════════════════════════════════╗
echo ║      🔍 AI LOOP MONITOR                ║
echo ╚════════════════════════════════════════╝
echo.
echo 📁 Handoff Directory: %HANDOFF_DIR%
echo.

echo Files:
if exist "%HANDOFF_DIR%" (
    dir /b "%HANDOFF_DIR%" 2>nul || echo   (empty)
) else (
    echo   (directory not found)
)

echo.
echo ═══ Latest Content ═══

if exist "%HANDOFF_DIR%\TASK.md" (
    echo.
    echo 📄 TASK.md:
    echo ────────────────────────────────────────
    type "%HANDOFF_DIR%\TASK.md"
    echo.
    echo ────────────────────────────────────────
)

if exist "%HANDOFF_DIR%\READY_FOR_REVIEW.md" (
    echo.
    echo 📄 READY_FOR_REVIEW.md:
    echo ────────────────────────────────────────
    type "%HANDOFF_DIR%\READY_FOR_REVIEW.md"
    echo.
    echo ────────────────────────────────────────
)

if exist "%HANDOFF_DIR%\REVIEW_FEEDBACK.md" (
    echo.
    echo 📄 REVIEW_FEEDBACK.md:
    echo ────────────────────────────────────────
    type "%HANDOFF_DIR%\REVIEW_FEEDBACK.md"
    echo.
    echo ────────────────────────────────────────
)

if exist "%HANDOFF_DIR%\APPROVED.md" (
    echo.
    echo 📄 APPROVED.md:
    echo ────────────────────────────────────────
    type "%HANDOFF_DIR%\APPROVED.md"
    echo.
    echo ────────────────────────────────────────
)

echo.
pause
