@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title XXXLGDXXX // ARCHIVE SYNC
cd /d "%~dp0"

echo.
echo  ============================================================
echo   XXXLGDXXX // SOURCE -^> ASTRO -^> GITLAB PAGES
echo   one-click sync: Public -^> media -^> canvases -^> build -^> push
echo  ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node 20 LTS: https://nodejs.org
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found. Install Node 20 LTS: https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/4] Installing dependencies...
  call npm ci
  if errorlevel 1 goto fail
) else (
  echo [1/4] Dependencies: OK
)

echo [2/4] Syncing vault and building site...
call npm run update
if errorlevel 1 goto fail

echo [3/4] Checking git...
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo [SKIP] Not a git repo yet.
  echo        Run: git init ^&^& git remote add origin YOUR_GITLAB_REPO.git
  goto done
)

set "REMOTE="
for /f "tokens=*" %%u in ('git remote get-url origin 2^>nul') do set "REMOTE=%%u"
if not defined REMOTE (
  echo [SKIP] No origin remote.
  echo        Run: git remote add origin YOUR_GITLAB_REPO.git
  goto done
)

git add -A
git diff --cached --quiet
if errorlevel 1 (
  echo [4/4] Committing and pushing to origin...
  call git commit -m "sync: %DATE% %TIME%"
  if errorlevel 1 goto fail
  call git push origin HEAD
  if errorlevel 1 goto fail
) else (
  echo [4/4] No changes to commit
)

goto done

:fail
echo.
echo [FAIL] Sync/build/push failed. See errors above.
pause
exit /b 1

:done
echo.
echo [OK] Ready. Output: dist\
echo      GitLab Pages deploys automatically after push to main.
echo.
pause
