@echo off
REM Bandaru Trade Research - single entry point (Windows).
REM Shows a menu, then delegates to scripts\windows\.

setlocal EnableDelayedExpansion
cd /d "%~dp0"
set "ROOT=%CD%"

cls
echo.
echo ===============================================================
if exist VERSION ( set /p APP_VERSION=<VERSION & echo   Bandaru Trade Research - v!APP_VERSION! ) else ( echo   Bandaru Trade Research )
echo ===============================================================
echo.
echo   Pick a mode:
echo.
echo     1^)  Docker            - Mongo + Express + nginx       ^(Yahoo data^)
echo     2^)  Docker + Schwab   - adds real-time data sidecar   ^(requires token^)
echo     3^)  Local Node        - Express + Vite, no Docker     ^(Yahoo data^)
echo     4^)  Python ^(Schwab^)   - legacy Flask app              ^(real-time, no Docker^)
echo.
echo     q^)  Quit
echo.
set /p choice=Choice:
echo.

if /i "%choice%"=="1" call "%ROOT%\scripts\windows\start-docker.bat" & goto :eof
if /i "%choice%"=="2" call "%ROOT%\scripts\windows\start-docker-schwab.bat" & goto :eof
if /i "%choice%"=="3" call "%ROOT%\scripts\windows\start-local.bat" & goto :eof
if /i "%choice%"=="4" call "%ROOT%\scripts\windows\start-schwab.bat" & goto :eof
if /i "%choice%"=="q" exit /b 0

echo [X] Invalid choice. Run again and pick 1-4 or q.
pause
endlocal
