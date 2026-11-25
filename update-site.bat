@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title СИНХРОНИЗАЦИЯ ХОЛСТОВ
cd /d "%~dp0"

echo.
echo  ============================================================
echo   СИСТЕМА -^> ХОЛСТЫ -^> СБОРКА -^> GITHUB PAGES
echo   один клик: источник -^> вложения -^> холсты -^> build -^> push
echo  ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node 22 LTS: https://nodejs.org
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found. Install Node 22 LTS: https://nodejs.org
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

echo [2/4] Syncing source and building site...
call npm run update
if errorlevel 1 goto fail

echo [3/4] Checking git...
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo [SKIP] Not a git repo yet.
  echo        Run: git init ^&^& git remote add origin YOUR_GITHUB_REPO.git
  goto done
)

set "REMOTE="
for /f "tokens=*" %%u in ('git remote get-url origin 2^>nul') do set "REMOTE=%%u"
if not defined REMOTE (
  echo [SKIP] No origin remote.
  echo        Run: git remote add origin YOUR_GITHUB_REPO.git
  goto done
)

git add -A
git diff --cached --quiet
if errorlevel 1 (
  echo [4/4] Committing and pushing to GitHub...
  call git commit -m "sync: %DATE% %TIME%"
  if errorlevel 1 goto fail
  git rev-parse --abbrev-ref --symbolic-full-name @{u} >nul 2>nul
  if errorlevel 1 (
    call git push -u origin HEAD
  ) else (
    call git pull --rebase
    if errorlevel 1 goto fail
    call git push origin HEAD
  )
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
echo      GitHub Pages deploys automatically after push to main.
echo.
pause
