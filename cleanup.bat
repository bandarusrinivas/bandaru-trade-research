@echo off
REM Bandaru Trade Research - cleanup (Windows).
REM Removes disposable junk: editor backups, Python caches, old token
REM backups, stale build output. Safe to re-run. Pass --dry-run to preview.
REM Never touches source code, .env, the Schwab token, node_modules, venvs,
REM or Docker volumes (your trade journal).

setlocal EnableDelayedExpansion
cd /d "%~dp0"

set DRY_RUN=0
if /i "%1"=="--dry-run" set DRY_RUN=1
if /i "%1"=="-n"        set DRY_RUN=1

echo.
echo ========================================
if "%DRY_RUN%"=="1" ( echo   Cleanup ^(DRY RUN - nothing removed^) ) else ( echo   Cleanup )
echo ========================================
echo.

set /a removed=0

REM --------------------------------------------------------------
echo 1. Editor / sed backup files (*.bak, *.orig)
REM --------------------------------------------------------------
for /f "delims=" %%f in ('dir /b /s *.bak *.orig 2^>nul ^| findstr /v "\\.git\\ \\.venv\\ \\node_modules\\"') do (
  if "%DRY_RUN%"=="1" ( echo   [dry-run] would remove %%f ) else ( del /f /q "%%f" >nul 2>&1 && (echo   - removed %%f & set /a removed+=1) )
)

REM --------------------------------------------------------------
echo.
echo 2. Python __pycache__ directories and .pyc files
REM --------------------------------------------------------------
for /f "delims=" %%d in ('dir /b /s /ad __pycache__ 2^>nul ^| findstr /v "\\.git\\ \\.venv\\"') do (
  if "%DRY_RUN%"=="1" ( echo   [dry-run] would remove %%d ) else ( rd /s /q "%%d" >nul 2>&1 && (echo   - removed %%d & set /a removed+=1) )
)
for /f "delims=" %%f in ('dir /b /s *.pyc 2^>nul ^| findstr /v "\\.git\\ \\.venv\\"') do (
  if "%DRY_RUN%"=="1" ( echo   [dry-run] would remove %%f ) else ( del /f /q "%%f" >nul 2>&1 && (echo   - removed %%f & set /a removed+=1) )
)

REM --------------------------------------------------------------
echo.
echo 3. Old Schwab token backups (the live token is kept)
REM --------------------------------------------------------------
for %%f in (legacy-python\schwab_token.json.bak*) do (
  if exist "%%f" (
    if "%DRY_RUN%"=="1" ( echo   [dry-run] would remove %%f ) else ( del /f /q "%%f" >nul 2>&1 && (echo   - removed %%f & set /a removed+=1) )
  )
)

REM --------------------------------------------------------------
echo.
echo 4. macOS metadata (.DS_Store)
REM --------------------------------------------------------------
for /f "delims=" %%f in ('dir /b /s .DS_Store 2^>nul ^| findstr /v "\\.git\\ \\.venv\\ \\node_modules\\"') do (
  if "%DRY_RUN%"=="1" ( echo   [dry-run] would remove %%f ) else ( del /f /q "%%f" >nul 2>&1 && (echo   - removed %%f & set /a removed+=1) )
)

REM --------------------------------------------------------------
echo.
echo 5. Stale Vite build output (mern\client\dist)
REM --------------------------------------------------------------
if exist "mern\client\dist" (
  if "%DRY_RUN%"=="1" ( echo   [dry-run] would remove mern\client\dist ) else ( rd /s /q "mern\client\dist" >nul 2>&1 && (echo   - removed mern\client\dist & set /a removed+=1) )
)

echo.
echo ===============================================================
echo   Summary: %removed% item^(s^) removed
if "%DRY_RUN%"=="1" echo   Re-run without --dry-run to actually delete.
echo ===============================================================
echo.
echo NOT touched (delete by hand if you really want the space back):
echo   legacy-python\.venv          Python virtualenv
echo   mern\*\node_modules          npm packages
echo   Docker volumes               stop.bat, then
echo                                'cd mern ^&^& docker compose down -v' to wipe Mongo
echo.
pause
endlocal
