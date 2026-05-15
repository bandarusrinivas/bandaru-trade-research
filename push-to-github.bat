@echo off
REM Bandaru Trade Research - push to GitHub (Windows)

setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ========================================
if exist VERSION (
  set /p APP_VERSION=<VERSION
  echo   Push to GitHub - v!APP_VERSION!
) else (
  echo   Push to GitHub
)
echo ========================================
echo.

REM 1. Clear stale index lock
if exist .git\index.lock (
  echo Removing stale .git\index.lock
  del /f /q .git\index.lock >nul 2>&1
)

REM 2. Verify remote
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo [X] No 'origin' remote configured.
  echo     Run: git remote add origin https://github.com/bandarusrinivas/bandaru-trade-research.git
  pause
  exit /b 1
)
for /f "delims=" %%u in ('git remote get-url origin') do set "ORIGIN=%%u"
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"
echo Origin: %ORIGIN%
echo Branch: %BRANCH%

REM 3. Show pending changes
echo.
echo === Pending changes ===
git status -s
for /f %%c in ('git status -s ^| find /c /v ""') do set "CHANGE_COUNT=%%c"

if "%CHANGE_COUNT%"=="0" (
  echo Nothing to commit. Working tree clean.
  set /p ANYWAY=Push anyway? [y/N]:
  if /i not "!ANYWAY!"=="y" (
    echo Aborted.
    pause
    exit /b 0
  )
) else (
  echo.
  echo %CHANGE_COUNT% file^(s^) to commit.
)

REM 4. Prompt for commit message
set "DEFAULT_MSG=Schwab launchers + Yahoo cache + tighter .gitignore"
echo.
set /p MSG=Commit message [default: "%DEFAULT_MSG%"]:
if "%MSG%"=="" set "MSG=%DEFAULT_MSG%"

REM 5. Confirmation
echo.
echo About to:
echo   * git add -A
echo   * git commit -m "%MSG%"
echo   * git push origin %BRANCH%
echo.
set /p PROCEED=Proceed? [y/N]:
if /i not "%PROCEED%"=="y" (
  echo Aborted.
  pause
  exit /b 0
)

REM 6. Stage + commit + push
if not "%CHANGE_COUNT%"=="0" (
  echo.
  echo ^> git add -A
  git add -A
  if errorlevel 1 ( echo [X] git add failed & pause & exit /b 1 )
  echo ^> git commit
  git commit -m "%MSG%"
  if errorlevel 1 ( echo [X] git commit failed & pause & exit /b 1 )
)

echo.
echo ^> git push  ^(may prompt for GitHub credentials^)
git push origin %BRANCH%
if errorlevel 1 ( echo [X] git push failed & pause & exit /b 1 )

echo.
echo Pushed successfully.
echo.
pause
endlocal
