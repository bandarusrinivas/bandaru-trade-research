@echo off
REM ====================================================================
REM  Bandaru Trade Research - Schwab sign-in / OAuth  (Windows)
REM
REM  start.bat runs this for you automatically when needed. You can also
REM  double-click it directly to force a fresh Schwab sign-in.
REM  Writes legacy-python\schwab_token.json (good for 7 days).
REM ====================================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0"
set "PROJECT_ROOT=%CD%"
set "LEGACY=%PROJECT_ROOT%\legacy-python"

echo.
echo ========================================
echo   Schwab sign-in (OAuth)
echo ========================================
echo.

REM --- Prerequisites ---
if not exist "%LEGACY%" ( echo [X] legacy-python folder is missing. & pause & exit /b 1 )
where python >nul 2>&1 || ( echo [X] Python not found. Install Python 3.10+ from https://www.python.org/downloads/ & pause & exit /b 1 )
if not exist "%PROJECT_ROOT%\.env" ( echo [X] %PROJECT_ROOT%\.env is missing. & pause & exit /b 1 )
if not exist "%LEGACY%\.env" copy /Y "%PROJECT_ROOT%\.env" "%LEGACY%\.env" >nul
findstr /R "^SCHWAB_API_KEY=.\+" "%LEGACY%\.env" >nul || ( echo [X] SCHWAB_API_KEY missing in .env & pause & exit /b 1 )
findstr /R "^SCHWAB_APP_SECRET=.\+" "%LEGACY%\.env" >nul || ( echo [X] SCHWAB_APP_SECRET missing in .env & pause & exit /b 1 )

REM --- Python venv ---
cd /d "%LEGACY%"
if not exist ".venv" ( echo Creating Python virtual environment... & python -m venv .venv )
call .venv\Scripts\activate.bat
python -c "import schwab, dotenv" >nul 2>&1
if errorlevel 1 (
  echo Installing dependencies ^(one-time, ~1 min^)...
  python -m pip install --quiet --upgrade pip
  pip install --quiet -r requirements.txt
)

REM --- Back up + remove any existing token so the manual flow runs fresh ---
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
echo   5. Copy the FULL address bar URL from that broken page.
echo   6. Paste it back into THIS window when prompted, then press Enter.
echo.
pause

REM --- Pause the Schwab sidecar container (if running) during re-auth ---
set "SIDECAR_WAS_RUNNING=0"
for /f "delims=" %%n in ('docker ps --format "{{.Names}}" 2^>nul ^| findstr /X bandaru-schwab') do set "SIDECAR_WAS_RUNNING=1"
if "!SIDECAR_WAS_RUNNING!"=="1" (
  echo Pausing the Schwab sidecar container during re-auth...
  docker stop bandaru-schwab >nul 2>&1
)

REM --- Run the interactive OAuth setup (also fetches a live SPY quote) ---
set "OAUTH_RC=0"
python -m src.schwab_setup
if errorlevel 1 set "OAUTH_RC=1"

REM --- Restart the sidecar so it loads the new token (regardless of result) ---
if "!SIDECAR_WAS_RUNNING!"=="1" (
  echo Restarting the Schwab sidecar so it loads the new token...
  docker start bandaru-schwab >nul 2>&1
)

if not "!OAUTH_RC!"=="0" (
  echo.
  echo [X] OAuth did NOT complete. See the errors above.
  echo     Common causes:
  echo       - The redirect URL was pasted incomplete - copy the WHOLE address
  echo         bar from the broken page, starting with https://127.0.0.1/?code=
  echo       - The authorization code expired - you have ~30 seconds to paste it.
  echo       - Wrong login - sign in with your Schwab BROKERAGE account.
  pause
  exit /b 1
)

if exist "schwab_token.json" (
  echo.
  echo [x] Token saved AND verified - Schwab accepted it (SPY price shown above).
  echo     %LEGACY%\schwab_token.json
  echo     Good for 7 days. Next: double-click start.bat to launch.
) else (
  echo.
  echo [X] OAuth ran but no token file was created. Check the output above.
  pause
  exit /b 1
)

pause
endlocal
