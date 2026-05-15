@echo off
REM Bandaru Trade Research - cleanup deprecated root launchers (Windows).
REM Run ONCE after migrating to the scripts\ layout.

setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ========================================
echo   Cleanup - deprecated root launchers
echo ========================================
echo.

set /a removed=0

REM Delete each stub if it contains the "DEPRECATED stub" marker
for %%n in (start-docker start-local start-schwab start-docker-schwab) do (
  for %%e in (command bat ps1) do (
    if exist "%%n.%%e" (
      findstr /C:"DEPRECATED stub" "%%n.%%e" >nul 2>&1
      if not errorlevel 1 (
        del /f /q "%%n.%%e" >nul 2>&1
        echo   - removed %%n.%%e
        set /a removed+=1
      )
    )
  )
)

REM Clean up sed .bak files
for %%f in (mern\server\routes\*.bak) do (
  if exist "%%f" del /f /q "%%f" && echo   - removed %%f
)

echo.
echo Done. Removed %removed% stub^(s^).
echo.
echo Your project root now has:
echo   start.bat            ^(interactive menu^)
echo   stop.bat
echo   auth-schwab.bat
echo   push-to-github.bat
echo   + .command versions for Mac
echo.
echo Mode-specific launchers live in scripts\mac\ and scripts\windows\.
pause
endlocal
