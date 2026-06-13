@echo off
REM ────────────────────────────────────────────────────────────────
REM  Bandaru Trade Research — Windows installer
REM
REM  Double-click to run. Wraps the PowerShell installer with the
REM  right execution policy so users don't have to mess with
REM  Set-ExecutionPolicy themselves.
REM
REM  Flags (passed through to install.ps1):
REM    --yahoo-only       Skip the Schwab prompt; use Yahoo delayed.
REM    --force-env        Overwrite an existing .env.
REM    --non-interactive  No prompts; defaults to Yahoo if .env is new.
REM ────────────────────────────────────────────────────────────────
setlocal
cd /d "%~dp0"

REM Translate friendly --flag style into PowerShell -switch style.
set "PSARGS="
:parse
if "%~1"=="" goto run
if /i "%~1"=="--yahoo-only"      set "PSARGS=%PSARGS% -YahooOnly"
if /i "%~1"=="--force-env"       set "PSARGS=%PSARGS% -ForceEnv"
if /i "%~1"=="--non-interactive" set "PSARGS=%PSARGS% -NonInteractive"
shift
goto parse

:run
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\install.ps1" %PSARGS%
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Install did not complete. See messages above.
    pause
    exit /b %ERRORLEVEL%
)
endlocal
