@echo off
REM Bandaru Trade Research - Push to GitHub (Windows)
REM Cleans stale git state, initializes fresh, commits, creates repo, pushes.

setlocal EnableDelayedExpansion
cd /d "%~dp0\.."

set "GH_USER=bandarusrinivas"
set "REPO_NAME=bandaru-trade-research"
set "COMMIT_MSG=Initial commit - Bandaru Trade Research"

echo.
echo ================================================
echo   Push to GitHub - %GH_USER%/%REPO_NAME%
echo ================================================
echo.

REM ---- 1. Verify .gitignore covers secrets ------------------------------------
if not exist .gitignore (
    echo X .gitignore is missing. Aborting.
    pause
    exit /b 1
)
findstr /R "^\.env$" .gitignore >nul
if errorlevel 1 (
    echo X .gitignore does not contain .env entry. Aborting.
    pause
    exit /b 1
)
findstr /R "^schwab_token" .gitignore >nul
if errorlevel 1 (
    echo X .gitignore does not contain schwab_token entry. Aborting.
    pause
    exit /b 1
)
echo + .gitignore properly excludes secrets

REM ---- 2. Verify git is installed ---------------------------------------------
where git >nul 2>nul
if errorlevel 1 (
    echo X Git for Windows is not installed.
    echo   Download from https://git-scm.com/download/win
    pause
    exit /b 1
)

REM ---- 3. Clean up stale lock files -------------------------------------------
if exist .git\index.lock del /f /q .git\index.lock
if exist .git\HEAD.lock  del /f /q .git\HEAD.lock

REM ---- 4. Initialize git if needed --------------------------------------------
if not exist .git (
    echo + git init
    git init -q
    git branch -M main
)

REM Configure git identity if missing
for /f "tokens=*" %%i in ('git config user.email 2^>nul') do set GIT_EMAIL=%%i
if "%GIT_EMAIL%"=="" (
    git config user.email "%GH_USER%@users.noreply.github.com"
    git config user.name "Srinivas Bandaru"
)

REM ---- 5. Stage and verify no secrets -----------------------------------------
echo + git add -A
git add -A
git diff --cached --name-only | findstr /R "^\.env$ ^schwab_token\.json$" >nul
if not errorlevel 1 (
    echo X SECRET FILE IS STAGED - aborting!
    git diff --cached --name-only
    pause
    exit /b 1
)
echo + Confirmed no secrets in staged files

REM ---- 6. Commit --------------------------------------------------------------
git diff --cached --quiet
if errorlevel 1 (
    git commit -q -m "%COMMIT_MSG%"
    echo + Committed: %COMMIT_MSG%
) else (
    echo + No new changes to commit
)

REM ---- 7. Install gh CLI if missing -------------------------------------------
where gh >nul 2>nul
if errorlevel 1 (
    echo.
    echo + GitHub CLI not installed. Attempting winget install...
    winget install --id GitHub.cli -e --silent
    REM Refresh PATH so gh becomes visible in this session
    set "PATH=%PATH%;%LOCALAPPDATA%\Programs\GitHub CLI"
    where gh >nul 2>nul
    if errorlevel 1 (
        echo.
        echo X Could not install gh CLI automatically.
        echo.
        echo Manual install options:
        echo   1. winget install --id GitHub.cli   (Windows 10/11 with winget^)
        echo   2. choco install gh                  (if you have Chocolatey^)
        echo   3. Download from https://cli.github.com/
        echo.
        echo Then re-run this script.
        pause
        exit /b 1
    )
)

REM ---- 8. Authenticate gh CLI -------------------------------------------------
gh auth status >nul 2>nul
if errorlevel 1 (
    echo.
    echo + Authenticating GitHub CLI via browser...
    echo   A one-time code will appear. Paste it on the github.com page.
    echo.
    gh auth login --hostname github.com --git-protocol https --web
    gh auth status >nul 2>nul
    if errorlevel 1 (
        echo X gh auth failed. Re-run this script.
        pause
        exit /b 1
    )
)
echo + GitHub CLI authenticated

REM ---- 9. Tell git to use gh for HTTPS auth -----------------------------------
gh auth setup-git >nul 2>nul

REM ---- 10. Create repo if it doesn't exist ------------------------------------
set "REPO_URL=https://github.com/%GH_USER%/%REPO_NAME%"
gh repo view "%GH_USER%/%REPO_NAME%" >nul 2>nul
if errorlevel 1 (
    echo + Creating repo %GH_USER%/%REPO_NAME%...
    gh repo create "%GH_USER%/%REPO_NAME%" --public --description "SPY 0DTE options day-trading dashboard"
) else (
    echo + Repo already exists on GitHub
)

REM ---- 11. Set/replace the remote ---------------------------------------------
git remote get-url origin >nul 2>nul
if errorlevel 1 (
    git remote add origin "%REPO_URL%.git"
) else (
    git remote set-url origin "%REPO_URL%.git"
)
echo + Remote set to %REPO_URL%.git

REM ---- 12. Push! --------------------------------------------------------------
echo.
echo + Pushing to %REPO_URL% ...
git push -u origin main
if errorlevel 1 (
    echo.
    echo X Push failed. Try: gh auth refresh   then re-run.
    pause
    exit /b 1
)

echo.
echo ================================================
echo   + PUSH COMPLETE!
echo ================================================
echo.
echo Repo:    %REPO_URL%
echo Actions: %REPO_URL%/actions
echo.
start "" "%REPO_URL%"
pause
