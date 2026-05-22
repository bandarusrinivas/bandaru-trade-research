@echo off
REM ====================================================================
REM  Bandaru Trade Research - START  (Windows)
REM
REM  The ONE command to launch everything. Just double-click it.
REM    - Checks Docker (and starts Docker Desktop if needed)
REM    - If the Schwab token is missing/expired, lets you CHOOSE:
REM        sign in now, or run on free delayed Yahoo data
REM    - Builds + starts every container
REM    - Opens the dashboard
REM
REM  To stop everything:  double-click  stop.bat
REM ====================================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0"
set "ROOT=%CD%"
set "URL=http://localhost:3000"

echo.
echo ===============================================================
if exist VERSION ( set /p APP_VERSION=<VERSION & echo   Bandaru Trade Research v!APP_VERSION! - START ) else ( echo   Bandaru Trade Research - START )
echo ===============================================================
echo.

REM --- 1. Docker ---
where docker >nul 2>&1 || ( echo [X] Docker Desktop is not installed. & pause & exit /b 1 )
docker info >nul 2>&1
if errorlevel 1 (
  echo [!] Docker Desktop isn't running - trying to start it...
  start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe" >nul 2>&1
  set /a WAIT=0
  :waitdocker
  timeout /t 3 /nobreak >nul
  set /a WAIT+=1
  docker info >nul 2>&1 && goto dockerok
  if !WAIT! LSS 25 goto waitdocker
  echo [X] Docker Desktop still isn't ready. Open it manually, wait for the
  echo     whale icon, then double-click start.bat again.
  pause
  exit /b 1
)
:dockerok
echo [x] Docker is running

REM --- 2. Environment file + data source ---
REM docker compose --env-file needs .env to exist - even on free Yahoo data.
REM On a fresh copy there is no .env (git-ignored so no secrets are committed),
REM so seed one from .env.example. start.bat then works from any folder.
if not exist ".env" (
  if exist ".env.example" (
    copy /Y ".env.example" ".env" >nul
    echo [!] No .env found - created one from .env.example ^(placeholder keys^).
    echo     Add real SCHWAB_API_KEY / SCHWAB_APP_SECRET to .env for live data.
  ) else (
    type nul > ".env"
    echo [!] No .env or .env.example found - created an empty .env.
  )
) else (
  echo [x] .env found
)

REM MODE ends up "schwab" (real-time) or "yahoo" (free, ~15-min delayed).
set "MODE="
set "HAS_CREDS=0"
findstr /R "^SCHWAB_API_KEY=.\+" .env >nul 2>&1 && findstr /R "^SCHWAB_APP_SECRET=.\+" .env >nul 2>&1 && set "HAS_CREDS=1"
REM Placeholder values shipped in .env.example do NOT count as real credentials.
findstr /R "^SCHWAB_API_KEY=your_" .env >nul 2>&1 && set "HAS_CREDS=0"
findstr /R "^SCHWAB_APP_SECRET=your_" .env >nul 2>&1 && set "HAS_CREDS=0"

if "!HAS_CREDS!"=="0" (
  echo [!] No Schwab API keys found in .env.
  echo     Starting on free Yahoo data ^(~15-min delayed^). Add SCHWAB_API_KEY and
  echo     SCHWAB_APP_SECRET to .env for real-time data.
  set "MODE=yahoo"
  goto launch
)

REM Credentials exist - is the token usable?
set "TOKEN_OK=0"
if exist "legacy-python\schwab_token.json" (
  for /f "delims=" %%a in ('python -c "import json,datetime;t=json.load(open(r'legacy-python/schwab_token.json'));print(f'{(datetime.datetime.now().timestamp()-t.get(\"creation_timestamp\",0))/86400.0:.1f}')" 2^>nul') do set "TOKEN_AGE=%%a"
  if "!TOKEN_AGE!"=="" set "TOKEN_AGE=999"
  for /f "delims=" %%a in ('python -c "print('OK' if float('!TOKEN_AGE!')^<=7 else 'OLD')" 2^>nul') do set "TOKEN_STATE=%%a"
  if "!TOKEN_STATE!"=="OK" set "TOKEN_OK=1"
)

if "!TOKEN_OK!"=="1" (
  echo [x] Schwab token is valid - launching with real-time data.
  set "MODE=schwab"
  goto launch
)

REM Token missing or expired - let the user choose.
echo.
echo   A Schwab sign-in is needed for real-time data. What would you like to do?
echo.
echo     1) Sign in to Schwab now    - real-time data        (recommended)
echo     2) Skip the sign-in         - free delayed Yahoo data
echo     3) Quit
echo.
set "choice="
set /p choice=  Your choice [1/2/3, default 1]:
if "!choice!"=="" set "choice=1"
if "!choice!"=="2" ( echo   OK - starting on free delayed Yahoo data. & set "MODE=yahoo" & goto launch )
if "!choice!"=="3" ( echo   Cancelled. Nothing was started. & pause & exit /b 0 )

REM Default / option 1 -> sign in
set "MODE=schwab"
echo.
echo A browser will open for Schwab sign-in. Follow the prompts in this window.
echo.
call "%ROOT%\auth-schwab.bat"
if errorlevel 1 (
  echo [!] Sign-in didn't finish - falling back to delayed Yahoo data.
  set "MODE=yahoo"
)

:launch
REM --- 3. Launch the stack ---
echo.
echo Starting the containers (!MODE! data)...
pushd mern
docker compose --profile schwab down --remove-orphans >nul 2>&1
if "!MODE!"=="schwab" (
  docker compose --env-file "%ROOT%\.env" -f docker-compose.yml -f docker-compose.schwab.yml --profile schwab up -d --build --force-recreate
) else (
  set "DATA_SOURCE=yahoo"
  docker compose --env-file "%ROOT%\.env" -f docker-compose.yml up -d --build --force-recreate
)
if errorlevel 1 ( popd & echo [X] docker compose failed - see output above. & pause & exit /b 1 )
popd
echo [x] Containers started

REM --- 4. Wait for the server ---
echo.
echo Waiting for the dashboard to come online...
set /a TRIES=0
:waitsrv
set /a TRIES+=1
timeout /t 2 /nobreak >nul
curl -fsS --max-time 3 http://localhost:4000/api/version >nul 2>&1 && goto srvok
if !TRIES! LSS 45 goto waitsrv
echo [!] Server slow to start - check logs with: docker compose logs -f
:srvok

REM --- 5. Verify Schwab data (schwab mode only) ---
if not "!MODE!"=="schwab" goto opendash
echo.
echo Checking real-time Schwab data...
set "DATASTATE="
for /f "delims=" %%a in ('curl -fsS --max-time 12 "http://localhost:4000/api/diagnose?ticker=SPY" 2^>nul ^| python -c "import sys,json; d=json.load(sys.stdin); print('LIVE' if (d.get('schwab') or {}).get('available') else 'FALLBACK')" 2^>nul') do set "DATASTATE=%%a"
if "!DATASTATE!"=="LIVE" (
  echo [x] Real-time Schwab data confirmed
) else (
  echo [!] Schwab rejected the token - the dashboard is on delayed Yahoo data.
  echo     Re-run auth-schwab.bat for a fresh sign-in, then start.bat again.
  echo     Details: http://localhost:4000/api/diagnose?ticker=SPY
)

:opendash
REM --- 6. Open the dashboard ---
echo.
echo Opening %URL%
start "" "%URL%"
echo.
echo ===============================================================
echo   Dashboard:  %URL%
echo   To stop:    double-click  stop.bat
echo ===============================================================
pause
endlocal
