@echo off
REM Bandaru Trade Research — Windows installer / first-time setup
REM Run this once after downloading or cloning the project. It checks what's
REM installed, tells you what's missing, and prepares you to run start.bat.

setlocal EnableDelayedExpansion
cd /d "%~dp0"
set "ROOT=%CD%"

echo.
echo ================================================================
echo   Bandaru Trade Research - Windows installer
echo ================================================================
echo.
echo This will check that you have everything needed to run the app,
echo and tell you exactly what to install if something is missing.
echo.
pause
cls

set DOCKER_OK=0
set NODE_OK=0
set GIT_OK=0
set PYTHON_OK=0
set SCHWAB_CREDS=0
set ANY_RUNTIME=0

REM ----------------------------------------------------------------
REM 1. Docker check
REM ----------------------------------------------------------------
echo.
echo [1/5] Checking for Docker Desktop...
where docker >nul 2>&1
if errorlevel 1 (
  echo   [ ] Docker is NOT installed.
  echo       Recommended: install Docker Desktop from
  echo       https://www.docker.com/products/docker-desktop/
) else (
  docker info >nul 2>&1
  if errorlevel 1 (
    echo   [!] Docker is installed but the daemon isn't running.
    echo       Open Docker Desktop, wait for the whale icon, then re-run this installer.
  ) else (
    echo   [x] Docker Desktop is running.
    set DOCKER_OK=1
    set ANY_RUNTIME=1
  )
)

REM ----------------------------------------------------------------
REM 2. Node.js check
REM ----------------------------------------------------------------
echo.
echo [2/5] Checking for Node.js...
where node >nul 2>&1
if errorlevel 1 (
  echo   [ ] Node.js is NOT installed.
  echo       Optional alternative to Docker. Install LTS from https://nodejs.org
) else (
  for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
  for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_RAW=%%a
  for /f "tokens=1 delims=." %%a in ("!NODE_RAW:v=!") do set NODE_MAJOR=%%a
  if !NODE_MAJOR! GEQ 18 (
    echo   [x] Node.js !NODE_VER! installed.
    set NODE_OK=1
    set ANY_RUNTIME=1
  ) else (
    echo   [!] Node !NODE_VER! is too old. Need 18 or newer.
    echo       Re-install LTS from https://nodejs.org
  )
)

REM ----------------------------------------------------------------
REM 3. Python check (for legacy Flask + Schwab OAuth)
REM ----------------------------------------------------------------
echo.
echo [3/5] Checking for Python (needed for Schwab OAuth)...
where python >nul 2>&1
if errorlevel 1 (
  echo   [ ] Python is NOT installed.
  echo       Needed for Schwab OAuth and the Python Flask mode.
  echo       Install Python 3.10+ from https://www.python.org/downloads/
  echo       During install tick "Add Python to PATH".
) else (
  for /f "tokens=*" %%v in ('python --version 2^>^&1') do set "PY_VER=%%v"
  echo   [x] !PY_VER! installed.
  set PYTHON_OK=1
)

REM ----------------------------------------------------------------
REM 4. Git check
REM ----------------------------------------------------------------
echo.
echo [4/5] Checking for git...
where git >nul 2>&1
if errorlevel 1 (
  echo   [ ] git is NOT installed.
  echo       Optional but recommended. Install from https://git-scm.com/download/win
  echo       Without git you'll need to re-download the ZIP each time you update.
) else (
  echo   [x] git installed.
  set GIT_OK=1
)

REM ----------------------------------------------------------------
REM 5. .env / Schwab credentials check
REM ----------------------------------------------------------------
echo.
echo [5/5] Checking for Schwab credentials...
if exist .env (
  findstr /R "^SCHWAB_API_KEY=.\+" .env >nul 2>&1
  if not errorlevel 1 (
    findstr /R "^SCHWAB_APP_SECRET=.\+" .env >nul 2>&1
    if not errorlevel 1 (
      echo   [x] .env contains SCHWAB_API_KEY and SCHWAB_APP_SECRET
      set SCHWAB_CREDS=1
      goto schwab_done
    )
  )
  echo   [ ] .env exists but is missing Schwab credentials
) else (
  echo   [ ] No .env file yet.
  if exist .env.example (
    echo       Copy .env.example to .env and fill in your Schwab keys to enable real-time data.
  ) else (
    echo       Create a .env file with SCHWAB_API_KEY and SCHWAB_APP_SECRET if you want real-time data.
  )
)
:schwab_done

REM ----------------------------------------------------------------
REM Summary + next step
REM ----------------------------------------------------------------
echo.
echo ================================================================
echo   SUMMARY
echo ================================================================
echo.

if "%ANY_RUNTIME%"=="0" (
  echo   You need to install Docker Desktop OR Node 18+ before running this app.
  echo.
  echo   Recommended: Docker Desktop from https://www.docker.com/products/docker-desktop/
  echo.
  pause
  exit /b 1
)

echo   Recommended next step:
echo.
if "%DOCKER_OK%"=="1" if "%SCHWAB_CREDS%"=="1" (
  echo     1. Double-click  auth-schwab.bat        ^(if you haven't already^)
  echo     2. Double-click  start.bat              -- pick option 2 ^(Docker + Schwab^)
  goto print_help
)
if "%DOCKER_OK%"=="1" (
  echo     1. Double-click  start.bat              -- pick option 1 ^(Docker / Yahoo^)
  echo.
  echo   To enable Schwab real-time data:
  echo     - Get an Individual Developer account at https://developer.schwab.com
  echo     - Add SCHWAB_API_KEY and SCHWAB_APP_SECRET to .env
  echo     - Re-run this installer
  goto print_help
)
if "%NODE_OK%"=="1" (
  echo     1. Double-click  start.bat              -- pick option 3 ^(Local Node / Yahoo^)
  echo.
  echo   For real-time Schwab data, install Docker Desktop and re-run this installer.
  goto print_help
)

:print_help
echo.
echo   Other useful files:
echo     start.bat             -- launch everything (auth included)
echo     stop.bat              -- stop everything
echo     docs\USER_GUIDE.md    -- full step-by-step guide + troubleshooting
echo.
echo   IMPORTANT: Don't double-click any .command files. Those are Mac-only.
echo              Always use the .bat versions on Windows.
echo.
pause
endlocal
