@echo off
REM ====================================================================
REM  Bandaru Trade Research - START  (Windows)
REM
REM  The ONE command to launch everything. Just double-click it.
REM    - Checks Docker
REM    - Signs you in to Schwab automatically if the token is missing/expired
REM    - Builds + starts all containers with real-time Schwab data
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

REM --- 2. Credentials ---
if not exist .env ( echo [X] .env is missing - your Schwab API keys live there. & pause & exit /b 1 )
findstr /R "^SCHWAB_API_KEY=.\+" .env >nul || ( echo [X] SCHWAB_API_KEY missing in .env & pause & exit /b 1 )
findstr /R "^SCHWAB_APP_SECRET=.\+" .env >nul || ( echo [X] SCHWAB_APP_SECRET missing in .env & pause & exit /b 1 )
echo [x] Schwab credentials present

REM --- 3. Sign in (auth) - only when the token is missing or expired ---
set "NEED_AUTH=0"
if not exist "legacy-python\schwab_token.json" (
  echo [!] No Schwab token yet - first-time sign-in needed.
  set "NEED_AUTH=1"
) else (
  for /f "delims=" %%a in ('python -c "import json,datetime;t=json.load(open(r'legacy-python/schwab_token.json'));print(f'{(datetime.datetime.now().timestamp()-t.get(\"creation_timestamp\",0))/86400.0:.1f}')" 2^>nul') do set "TOKEN_AGE=%%a"
  if "!TOKEN_AGE!"=="" set "TOKEN_AGE=999"
  for /f "delims=" %%a in ('python -c "print('OLD' if float('!TOKEN_AGE!')^>7 else 'OK')" 2^>nul') do set "TOKEN_STATE=%%a"
  if "!TOKEN_STATE!"=="OLD" (
    echo [!] Your Schwab token has expired - signing in again.
    set "NEED_AUTH=1"
  )
)
if "!NEED_AUTH!"=="1" (
  echo.
  echo A browser will open for Schwab sign-in. Follow the prompts in this window.
  echo.
  call "%ROOT%\auth-schwab.bat"
  if errorlevel 1 ( echo [X] Schwab sign-in didn't finish. Double-click start.bat to try again. & pause & exit /b 1 )
)
echo [x] Schwab sign-in ready

REM --- 4. Launch ---
echo.
echo Starting all containers (Mongo + Schwab + Express + nginx)...
pushd mern
docker compose --profile schwab down --remove-orphans >nul 2>&1
docker compose --env-file "%ROOT%\.env" -f docker-compose.yml -f docker-compose.schwab.yml --profile schwab up -d --build --force-recreate
if errorlevel 1 ( popd & echo [X] docker compose failed - see output above. & pause & exit /b 1 )
popd
echo [x] Containers started

REM --- 5. Wait for the server ---
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

REM --- 6. Verify Schwab data ---
echo.
echo Checking real-time Schwab data...
set "DATASTATE="
for /f "delims=" %%a in ('curl -fsS --max-time 12 "http://localhost:4000/api/diagnose?ticker=SPY" 2^>nul ^| python -c "import sys,json; d=json.load(sys.stdin); print('LIVE' if (d.get('schwab') or {}).get('available') else 'FALLBACK')" 2^>nul') do set "DATASTATE=%%a"
if "!DATASTATE!"=="LIVE" (
  echo [x] Real-time Schwab data confirmed
) else (
  echo [!] Running on delayed Yahoo data - the Schwab token may need re-auth.
  echo     Details: http://localhost:4000/api/diagnose?ticker=SPY
)

REM --- 7. Open the dashboard ---
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
