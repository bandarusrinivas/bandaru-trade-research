@echo off
REM Bandaru Trade Research - Docker + Schwab launcher (Windows)
setlocal EnableDelayedExpansion
cd /d "%~dp0\..\.."
set "URL=http://localhost:3000"

echo.
echo ========================================
if exist VERSION ( set /p APP_VERSION=<VERSION & echo   Bandaru Trade Research - v!APP_VERSION! ) else ( echo   Bandaru Trade Research )
echo   Mode: Docker + Schwab ^(real-time^)
echo ========================================
echo.

where docker >nul 2>&1 || ( echo [X] Docker not installed & pause & exit /b 1 )
docker info >nul 2>&1 || ( echo [X] Docker daemon not running & pause & exit /b 1 )

if not exist "legacy-python\schwab_token.json" (
  echo [X] No Schwab token. Run auth-schwab.bat first.
  pause
  exit /b 1
)
echo Token present

if not exist .env ( echo [X] .env missing & pause & exit /b 1 )
findstr /R "^SCHWAB_API_KEY=.\+" .env >nul || ( echo [X] SCHWAB_API_KEY missing & pause & exit /b 1 )
findstr /R "^SCHWAB_APP_SECRET=.\+" .env >nul || ( echo [X] SCHWAB_APP_SECRET missing & pause & exit /b 1 )

echo Starting all 4 containers...
pushd mern
set "DATA_SOURCE=schwab"
docker compose --profile schwab up -d --build
if errorlevel 1 ( popd & echo [X] docker compose failed & pause & exit /b 1 )
popd

echo Waiting for sidecar health...
set /a TRIES=0
:wait_loop
set /a TRIES+=1
timeout /t 2 /nobreak >nul
for /f "delims=" %%s in ('docker inspect --format "{{.State.Health.Status}}" bandaru-schwab 2^>nul') do set "HEALTH=%%s"
if "%HEALTH%"=="healthy" goto sidecar_ready
if %TRIES% LSS 30 goto wait_loop
echo [!] Sidecar didn't go healthy. Check: docker compose logs schwab

:sidecar_ready
echo.
echo Opening %URL%
start "" "%URL%"
echo.
echo Sidecar logs:  docker compose logs -f schwab
echo Stop:          double-click stop.bat
pause
endlocal
