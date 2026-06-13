@echo off
REM Bandaru Trade Research — daily launcher (Windows).
REM Wrapper for scripts\windows\start.ps1. Double-click to run.
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\start.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Start did not complete. See messages above.
    pause
    exit /b %ERRORLEVEL%
)
endlocal
