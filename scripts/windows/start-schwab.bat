@echo off
REM Bandaru Trade Research - Schwab launcher (Windows, legacy Python Flask)
setlocal EnableDelayedExpansion
cd /d "%~dp0\..\.."
set "PROJECT_ROOT=%CD%"
set "LEGACY=%PROJECT_ROOT%\legacy-python"
set "URL=http://127.0.0.1:5000"

echo.
echo ========================================
if exist VERSION ( set /p APP_VERSION=<VERSION & echo   Bandaru Trade Research - v!APP_VERSION! ) else ( echo   Bandaru Trade Research )
echo   Mode: Schwab ^(legacy Python Flask^)
echo ========================================
echo.

if not exist "%LEGACY%" ( echo [X] legacy-python missing & pause & exit /b 1 )
where python >nul 2>&1 || ( echo [X] Python 3.10+ required & pause & exit /b 1 )
if not exist "%PROJECT_ROOT%\.env" ( echo [X] .env missing & pause & exit /b 1 )
if not exist "%LEGACY%\.env" copy /Y "%PROJECT_ROOT%\.env" "%LEGACY%\.env" >nul
findstr /R "^SCHWAB_API_KEY=.\+" "%LEGACY%\.env" >nul || ( echo [X] SCHWAB_API_KEY missing & pause & exit /b 1 )
findstr /R "^SCHWAB_APP_SECRET=.\+" "%LEGACY%\.env" >nul || ( echo [X] SCHWAB_APP_SECRET missing & pause & exit /b 1 )

set "DATA_SOURCE=schwab"
cd /d "%LEGACY%"
if not exist ".venv" ( python -m venv .venv )
call .venv\Scripts\activate.bat
python -c "import flask, schwab, dotenv, pytz, yfinance" >nul 2>&1
if errorlevel 1 ( python -m pip install --quiet --upgrade pip & pip install --quiet -r requirements.txt )

if not exist "schwab_token.json" (
  echo.
  echo [!] No Schwab token. Running interactive OAuth setup first...
  pause
  python -m src.schwab_setup
  if not exist "schwab_token.json" ( echo [X] OAuth failed & pause & exit /b 1 )
)
echo Token present

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":5000 .*LISTENING"') do (
  if not "%%a"=="0" ( taskkill /F /PID %%a >nul 2>&1 )
)

echo.
echo Starting Flask on %URL%
start "" cmd /c "timeout /t 3 /nobreak >nul && start "" "%URL%""
python app.py
endlocal
