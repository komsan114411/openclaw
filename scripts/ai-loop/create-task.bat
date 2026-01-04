@echo off
chcp 65001 >nul

set "PROJECT_DIR=%~dp0..\.."
set "HANDOFF_DIR=%PROJECT_DIR%\.ai\handoff"

:: Create directory
if not exist "%HANDOFF_DIR%" mkdir "%HANDOFF_DIR%"

:: Clean old files
del "%HANDOFF_DIR%\READY_FOR_REVIEW.md" 2>nul
del "%HANDOFF_DIR%\REVIEW_FEEDBACK.md" 2>nul
del "%HANDOFF_DIR%\APPROVED.md" 2>nul

:: Create task file
(
echo # 📋 New Task
echo.
echo ## 🎯 Objective
echo [อธิบายเป้าหมาย]
echo.
echo ## 📝 Requirements
echo 1. [ข้อกำหนด 1]
echo 2. [ข้อกำหนด 2]
echo 3. [ข้อกำหนด 3]
echo.
echo ## 📁 Files to Modify
echo - [ ] path/to/file1.ts
echo - [ ] path/to/file2.ts
echo.
echo ## 🧪 Acceptance Criteria
echo - [ ] [เงื่อนไขที่ต้องผ่าน 1]
echo - [ ] [เงื่อนไขที่ต้องผ่าน 2]
echo.
echo ## ⏰ Created
echo %date% %time%
) > "%HANDOFF_DIR%\TASK.md"

echo ✅ Created: %HANDOFF_DIR%\TASK.md
echo 📝 กรุณาแก้ไขไฟล์แล้วสั่ง Developer AI เริ่มงาน
echo.

:: Open in notepad
notepad "%HANDOFF_DIR%\TASK.md"
