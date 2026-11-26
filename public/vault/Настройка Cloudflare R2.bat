@echo off
title R2 SETUP
cd /d "D:\tests_new\astro-garden"

echo.
echo  ============================================================
echo   ONE-TIME CLOUDFLARE R2 SETUP
echo   Creates local config and deploys the Worker.
echo  ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node 22 LTS: https://nodejs.org
  pause
  exit /b 1
)

call npm run setup:r2
if errorlevel 1 goto fail

echo.
echo [2/2] Deploying Worker...
call npm run deploy:worker
if errorlevel 1 goto fail

echo.
echo [OK] Setup finished. Next updates go through the watcher bat.
pause
exit /b 0

:fail
echo.
echo [FAIL] Setup stopped.
pause
exit /b 1
