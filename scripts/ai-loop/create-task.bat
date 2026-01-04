@echo off
chcp 65001 >nul

set "HANDOFF_DIR=.ai\handoff"
if not exist "%HANDOFF_DIR%" mkdir "%HANDOFF_DIR%"

del "%HANDOFF_DIR%\READY_FOR_REVIEW.md" 2>nul
del "%HANDOFF_DIR%\REVIEW_FEEDBACK.md" 2>nul
del "%HANDOFF_DIR%\APPROVED.md" 2>nul

echo # New Task> "%HANDOFF_DIR%\TASK.md"
echo.>> "%HANDOFF_DIR%\TASK.md"
echo ## Objective>> "%HANDOFF_DIR%\TASK.md"
echo [Describe objective]>> "%HANDOFF_DIR%\TASK.md"
echo.>> "%HANDOFF_DIR%\TASK.md"
echo ## Requirements>> "%HANDOFF_DIR%\TASK.md"
echo 1. [Requirement 1]>> "%HANDOFF_DIR%\TASK.md"
echo 2. [Requirement 2]>> "%HANDOFF_DIR%\TASK.md"
echo.>> "%HANDOFF_DIR%\TASK.md"
echo ## Acceptance Criteria>> "%HANDOFF_DIR%\TASK.md"
echo - [ ] [Criteria 1]>> "%HANDOFF_DIR%\TASK.md"
echo - [ ] [Criteria 2]>> "%HANDOFF_DIR%\TASK.md"

echo Created: %HANDOFF_DIR%\TASK.md
echo Please edit the file and start Developer AI
notepad "%HANDOFF_DIR%\TASK.md"
