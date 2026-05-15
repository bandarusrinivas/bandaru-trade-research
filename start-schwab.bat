@echo off
REM Bandaru Trade Research - Schwab launcher (Windows)
REM Runs the legacy Python Flask app with the Schwab real-time data client.

setlocal EnableDelayedExpansion
cd /d "%~dp0"
set "PROJECT_ROOT=%CD%"
set "LEGACY=%PROJECT_ROOT%\legacy-python"
set "URL=http://127.0.0.1:5000"

echo.
echo ========================================
if exist VERSION (
  set /p APP_VERSION=<VERSION
  echo   Bandaru Trade Research - v!APP_VERSION!
) else (
  echo   Bandaru Trade Research
)
echo   Mode: Schwab ^(legacy Python Flask^)
echo ========================================
echo.

REM 1. Sanity checks
if not exist "%LEGACY%" (
  echo [X] legacy-python folder is missing.
  pause
  exit /b 1
)
where python >nul 2>&1
if errorlevel 1 (
  echo [X] python not found. Install Python 3.10+ from https://www.python.org/downloads/
  echo     Tick "Add Python to PATH" during install.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('python -c "import sys;print(f\"{sys.version_info.major}.{sys.version_info.minor}\")"') do set "PY_VER=%%v"
echo Python %PY_VER% detected

REM 2. .env handling
if not exist "%PROJECT_ROOT%\.env" (
  echo [X] %PROJECT_ROOT%\.env is missing. SCHWAB credentials live there.
  pause
  exit /b 1
)
REM Windows doesn't symlink easily — copy if not already mirrored
if not exist "%LEGACY%\.env" (
  echo Copying .env into legacy-python\
  copy /Y "%PROJECT_ROOT%\.env" "%LEGACY%\.env" >nul
)

findstr /R "^SCHWAB_API_KEY=.\+" "%LEGACY%\.env" >nul || (
  echo [X] SCHWAB_API_KEY missing from .env
  pause
  exit /b 1
)
findstr /R "^SCHWAB_APP_SECRET=.\+" "%LEGACY%\.env" >nul || (
  echo [X] SCHWAB_APP_SECRET missing from .env
  pause
  exit /b 1
)

set "DATA_SOURCE=schwab"

REM 3. venv setup
cd /d "%LEGACY%"
if not exist ".venv" (
  echo Creating Python virtual environment ^(.venv^)...
  python -m venv .venv
)
call .venv\Scripts\activate.bat

python -c "import flask, schwab, dotenv, pytz, yfinance" >nul 2>&1
if errorlevel 1 (
  echo Installing Python dependencies ^(first-time setup, ~1 min^)...
  python -m pip install --quiet --upgrade pip
  pip install --quiet -r requirements.txt
)

REM 4. Token check - auto-run OAuth if missing
if not exist "schwab_token.json" (
  echo.
  echo [!] No Schwab token found. Running interactive OAuth setup first...
  echo.
  echo You'll be asked to:
  echo   1. Sign in to Schwab in a browser
  echo   2. Approve the app
  echo   3. Copy the redirect URL ^(page will look broken - that's OK^)
  echo   4. Paste it back here when prompted
  echo.
  pause
  python -m src.schwab_setup
  if not exist "schwab_token.json" (
    echo [X] OAuth did not produce a token. Aborting.
    pause
    exit /b 1
  )
  echo OAuth complete.
)
echo Schwab token present

REM 5. Free port 5000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":5000 .*LISTENING"') do (
  if not "%%a"=="0" (
    echo Killing previous server on port 5000 ^(PID %%a^)
    taskkill /F /PID %%a >nul 2>&1
  )
)

REM 6. Launch
echo.
echo Starting Flask on %URL%
echo Press Ctrl+C in this window to stop.
echo.

REM Open browser after a short delay
start "" cmd /c "timeout /t 3 /nobreak >nul && start "" "%URL%""

python app.py
endlocal
