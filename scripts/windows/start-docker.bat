@echo off
REM Bandaru Trade Research - Docker launcher (Windows)
setlocal EnableDelayedExpansion
cd /d "%~dp0\..\.."
set "URL=http://localhost:3000"

echo.
echo ========================================
if exist VERSION ( set /p APP_VERSION=<VERSION & echo   Bandaru Trade Research - v!APP_VERSION! ) else ( echo   Bandaru Trade Research )
echo   Mode: Docker ^(production, Yahoo^)
echo ========================================
echo.

where docker >nul 2>&1 || ( echo [X] Docker not installed. Install Docker Desktop. & pause & exit /b 1 )
docker info >nul 2>&1 || ( echo [X] Docker daemon not running. Open Docker Desktop. & pause & exit /b 1 )

echo Building + starting Mongo + Express + nginx...
pushd mern
docker compose up -d --build
if errorlevel 1 ( popd & echo [X] docker compose failed & pause & exit /b 1 )
popd

echo.
echo Stack up. Opening %URL%
start "" "%URL%"
echo.
echo Stop:  double-click stop.bat
pause
endlocal
