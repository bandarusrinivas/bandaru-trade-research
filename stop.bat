@echo off
REM Bandaru Trade Research - stop launcher (Windows)

setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo Stopping Bandaru Trade Research...

REM --- 1) Docker mode ------------------------------------------------------
where docker >nul 2>&1
if not errorlevel 1 (
  if exist mern\docker-compose.yml (
    docker compose -f mern\docker-compose.yml ps --services >nul 2>&1
    if not errorlevel 1 (
      echo   - Bringing down docker compose stack...
      pushd mern
      docker compose down
      popd
    )
  )
)

REM --- 2) Dev mode: kill node processes on :4000 and :5173 -----------------
for %%P in (4000 5173) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    if not "%%a"=="0" (
      echo   - Killing PID %%a on port %%P
      taskkill /F /PID %%a >nul 2>&1
    )
  )
)

REM --- 3) Belt-and-suspenders: close the two cmd windows we launched -------
taskkill /F /FI "WINDOWTITLE eq Bandaru Server" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Bandaru Client" >nul 2>&1

echo.
echo Stopped.
pause
endlocal
