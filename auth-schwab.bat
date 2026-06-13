@echo off
REM Bandaru Trade Research — Schwab OAuth (Windows).
REM Runs the OAuth flow inside the bandaru-schwab Docker container,
REM so no host Python install or venv is needed. Double-click to run.
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\auth-schwab.ps1"
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)
endlocal
