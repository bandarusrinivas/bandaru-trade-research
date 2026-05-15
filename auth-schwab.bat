@echo off
REM Bandaru Trade Research - Schwab OAuth (Windows, interactive)
REM Re-authorize against Schwab. Use this when your token is expired/broken
REM or before the very first run. Writes legacy-python\schwab_token.json.

setlocal EnableDelayedExpansion
cd /d "%~dp0"
set "PROJECT_ROOT=%CD%"
set "LEGACY=%PROJECT_ROOT%\legacy-python"

echo.
echo ========================================
echo   Schwab OAuth - interactive
echo ========================================
echo.

if not exist "%LEGACY%" (
  echo [X] legacy-python folder is missing.
  pause
  exit /b 1
)
where python >nul 2>&1
if errorlevel 1 (
  echo [X] python not found. Install Python 3.10+ from https://www.python.org/downloads/
  pause
  exit /b 1
)

if not exist "%PROJECT_ROOT%\.env" (
  echo [X] %PROJECT_ROOT%\.env is missing.
  pause
  exit /b 1
)
if not exist "%LEGACY%\.env" copy /Y "%PROJECT_ROOT%\.env" "%LEGACY%\.env" >nul

findstr /R "^SCHWAB_API_KEY=.\+" "%LEGACY%\.env" >nul || ( echo [X] SCHWAB_API_KEY missing & pause & exit /b 1 )
findstr /R "^SCHWAB_APP_SECRET=.\+" "%LEGACY%\.env" >nul || ( echo [X] SCHWAB_APP_SECRET missing & pause & exit /b 1 )

cd /d "%LEGACY%"
if not exist ".venv" (
  echo Creating Python venv...
  python -m venv .venv
)
call .venv\Scripts\activate.bat

python -c "import schwab, dotenv" >nul 2>&1
if errorlevel 1 (
  echo Installing dependencies ^(one-time, ~1 min^)...
  python -m pip install --quiet --upgrade pip
  pip install --quiet -r requirements.txt
)

REM Back up + remove any existing token so the manual flow runs fresh
if exist "schwab_token.json" (
  set "ts=%date:~-4%%date:~3,2%%date:~0,2%-%time:~0,2%%time:~3,2%%time:~6,2%"
  set "ts=!ts: =0!"
  copy /Y schwab_token.json "schwab_token.json.bak-!ts!" >nul
  echo Existing token backed up.
  del /f schwab_token.json
)

echo.
echo What's about to happen:
echo   1. A browser opens to Schwab's login page ^(or a URL is printed below^).
echo   2. Sign in with your Schwab BROKERAGE account.
echo   3. Approve the "Bandaru Trade Research" app.
echo   4. Schwab redirects to https://127.0.0.1/?code=...
echo      The page WILL look broken ^(cert error / can't reach^) - that's expected.
echo   5. Copy the FULL address bar URL.
echo   6. Paste it back into THIS terminal when prompted.
echo   7. schwab-py writes schwab_token.json.
echo.
pause

python -m src.schwab_setup

if exist "schwab_token.json" (
  echo.
  echo Token saved to %LEGACY%\schwab_token.json
  echo Next: double-click start-schwab.bat to launch the dashboard.
) else (
  echo.
  echo [X] OAuth completed but no token file was created.
  echo     Check the output above for errors.
  pause
  exit /b 1
)

pause
endlocal
