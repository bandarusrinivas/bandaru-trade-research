@echo off
REM Bandaru Trade Research — stopper (Windows).
REM Wrapper for scripts\windows\stop.ps1. Double-click to run.
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\stop.ps1"
endlocal
