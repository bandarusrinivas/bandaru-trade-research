@echo off
REM Bandaru Trade Research - Docker launcher (Windows)
REM Runs the full production stack: Mongo + Express + nginx-served React.

setlocal EnableDelayedExpansion
cd /d "%~dp0"
set "URL=http://localhost:3000"

echo.
echo ========================================
if exist VERSION (
  set /p APP_VERSION=<VERSION
  echo   Bandaru Trade Research - v!APP_VERSION!
) else (
  echo   Bandaru Trade Research
)
echo   Mode: Docker ^(production^)
echo ========================================
echo.

where docker >nul 2>&1
if errorlevel 1 (
  echo [X] Docker is not installed.
  echo     Install Docker Desktop from https://www.docker.com/products/docker-desktop/
  echo     Or use start-local.bat if you'd rather run with local Node.
  pause
  exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
  echo [X] Docker is installed but the daemon isn't running.
  echo     Open Docker Desktop, wait for the whale icon, then re-run this script.
  pause
  exit /b 1
)

echo Building images + starting Mongo + Express + nginx...
pushd mern
docker compose up -d --build
if errorlevel 1 (
  popd
  echo.
  echo [X] docker compose failed. Run 'docker compose logs' from mern\ to debug.
  pause
  exit /b 1
)
popd

echo.
echo Stack is up. Opening %URL%
start "" "%URL%"
echo.
echo Tail logs:    docker compose logs -f          ^(run from mern\^)
echo Stop:         double-click stop.bat
echo Wipe data:    docker compose down -v          ^(erases Trade Journal^)
echo.
pause
endlocal
