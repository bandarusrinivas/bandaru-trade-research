@echo off
REM Bandaru Trade Research - one-click launcher (Windows)
REM Double-click this file in Explorer. Tries Docker first; falls back to local Node dev.

setlocal EnableDelayedExpansion
cd /d "%~dp0"
set "PROJECT_ROOT=%CD%"
set "URL_PROD=http://localhost:3000"
set "URL_DEV=http://localhost:5173"

echo.
echo ========================================
if exist VERSION (
  set /p APP_VERSION=<VERSION
  echo   Bandaru Trade Research - v!APP_VERSION!
) else (
  echo   Bandaru Trade Research
)
echo ========================================
echo.

REM --- Try Docker first ----------------------------------------------------
where docker >nul 2>&1
if not errorlevel 1 (
  docker info >nul 2>&1
  if not errorlevel 1 (
    echo Docker detected. Starting production stack...
    pushd mern
    docker compose up -d --build
    if errorlevel 1 (
      echo.
      echo [!] docker compose failed. Falling back to dev mode...
      popd
      goto dev_mode
    )
    popd
    echo.
    echo Stack is up. Opening %URL_PROD%
    start "" "%URL_PROD%"
    echo.
    echo Tail logs:    docker compose logs -f
    echo Stop:         double-click stop.bat ^(or "docker compose down" in mern\)
    goto end
  )
)

:dev_mode
echo Docker not available. Starting local Node dev mode...

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo [X] Node.js is required. Install Node 20+ from https://nodejs.org
  echo     Then double-click start.bat again.
  pause
  exit /b 1
)

for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
if "%NODE_MAJOR%"=="" set NODE_MAJOR=0
for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_RAW=%%a
REM Extract major version cleanly
for /f "tokens=1 delims=." %%a in ("%NODE_RAW:v=%") do set NODE_MAJOR=%%a
if %NODE_MAJOR% LSS 18 (
  echo [X] Node %NODE_MAJOR% detected. Need Node 18 or newer.
  pause
  exit /b 1
)

echo   - Installing server deps ^(if needed^)...
if not exist mern\server\node_modules (
  pushd mern\server
  call npm install --no-audit --no-fund
  popd
)

echo   - Installing client deps ^(if needed^)...
if not exist mern\client\node_modules (
  pushd mern\client
  call npm install --no-audit --no-fund
  popd
)

echo.
echo   - Booting Express on :4000 ^(Trade Journal disabled without Mongo^)
set "MONGO_URI=mongodb://127.0.0.1:1/x?serverSelectionTimeoutMS=300"
start "Bandaru Server" /MIN cmd /c "cd /d %PROJECT_ROOT%\mern\server && set MONGO_URI=%MONGO_URI% && node server.js > %TEMP%\bandaru-server.log 2>&1"

echo   - Booting Vite dev server on :5173
start "Bandaru Client" /MIN cmd /c "cd /d %PROJECT_ROOT%\mern\client && npm run dev > %TEMP%\bandaru-client.log 2>&1"

echo.
echo Waiting for the dev server to come up...
set /a TRIES=0
:wait_loop
set /a TRIES+=1
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -Uri '%URL_DEV%' -TimeoutSec 1).StatusCode } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  if %TRIES% LSS 30 goto wait_loop
)

echo Opening %URL_DEV%
start "" "%URL_DEV%"
echo.
echo Server log:  %TEMP%\bandaru-server.log
echo Client log:  %TEMP%\bandaru-client.log
echo Stop:        double-click stop.bat

:end
echo.
pause
endlocal
