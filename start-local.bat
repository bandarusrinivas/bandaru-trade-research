@echo off
REM Bandaru Trade Research - local launcher (Windows, no Docker)
REM Runs Express + Vite directly with your installed Node.

setlocal EnableDelayedExpansion
cd /d "%~dp0"
set "PROJECT_ROOT=%CD%"
set "URL=http://localhost:5173"

echo.
echo ========================================
if exist VERSION (
  set /p APP_VERSION=<VERSION
  echo   Bandaru Trade Research - v!APP_VERSION!
) else (
  echo   Bandaru Trade Research
)
echo   Mode: Local Node ^(dev^)
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [X] Node.js is not installed.
  echo     Install Node 20+ from https://nodejs.org
  echo     Or use start-docker.bat if you'd rather run with Docker.
  pause
  exit /b 1
)

REM Extract node major version
for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_RAW=%%a
for /f "tokens=1 delims=." %%a in ("%NODE_RAW:v=%") do set NODE_MAJOR=%%a
if %NODE_MAJOR% LSS 18 (
  echo [X] Node %NODE_MAJOR% detected. Need Node 18 or newer.
  pause
  exit /b 1
)
node -v

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

REM Detect optional local MongoDB on :27017
set "MONGO_URI=mongodb://127.0.0.1:1/x?serverSelectionTimeoutMS=300"
powershell -NoProfile -Command "try { $c = New-Object System.Net.Sockets.TcpClient('127.0.0.1', 27017); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo   - Local MongoDB detected on :27017 - Trade Journal enabled
  set "MONGO_URI=mongodb://127.0.0.1:27017/bandaru"
) else (
  echo   - No MongoDB on :27017 - Trade Journal disabled ^(everything else works^)
)

echo.
echo   - Booting Express on :4000...
start "Bandaru Server" /MIN cmd /c "cd /d %PROJECT_ROOT%\mern\server && set MONGO_URI=%MONGO_URI% && node server.js > %TEMP%\bandaru-server.log 2>&1"

echo   - Booting Vite dev server on :5173...
start "Bandaru Client" /MIN cmd /c "cd /d %PROJECT_ROOT%\mern\client && npm run dev > %TEMP%\bandaru-client.log 2>&1"

echo.
echo Waiting for the dev server to come up...
set /a TRIES=0
:wait_loop
set /a TRIES+=1
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -TimeoutSec 1).StatusCode } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  if %TRIES% LSS 30 goto wait_loop
)

echo Opening %URL%
start "" "%URL%"
echo.
echo Server log:  %TEMP%\bandaru-server.log
echo Client log:  %TEMP%\bandaru-client.log
echo Stop:        double-click stop.bat
echo.
pause
endlocal
