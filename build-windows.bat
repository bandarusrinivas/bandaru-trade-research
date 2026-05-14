@echo off
REM Build the Bandaru Trade Analysis Platform as a Windows .exe.
REM Output: dist\Bandaru Trade Analysis\Bandaru Trade Analysis.exe
REM Double-click the .exe to launch — no Python install required on target PC.

setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\activate.bat" (
    echo ERROR: Virtual environment missing.
    echo Create one first:
    echo     python -m venv .venv
    echo     .venv\Scripts\activate.bat
    echo     pip install -r requirements.txt
    pause
    exit /b 1
)

call .venv\Scripts\activate.bat

echo ================================================
echo   Building Bandaru Trade Analysis - Windows
echo ================================================

echo Installing PyInstaller if needed...
pip install --quiet --upgrade pyinstaller

echo Cleaning previous builds...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

echo Running PyInstaller (this may take 2-5 minutes)...
pyinstaller bandaru.spec --noconfirm

echo.
echo ================================================
echo   Build complete!
echo ================================================
echo.
echo Output:
echo   dist\Bandaru Trade Analysis\Bandaru Trade Analysis.exe
echo.
echo To distribute:
echo   1. Right-click "Bandaru Trade Analysis" folder ^> Send to ^> Compressed (zipped) folder
echo   2. Share the resulting .zip with anyone on Windows
echo   3. They unzip and double-click the .exe to run - no Python needed!
echo.
echo Optional - create a one-file .exe (slower startup but cleaner distribution):
echo   pyinstaller bandaru.spec --noconfirm --onefile
echo.
pause
