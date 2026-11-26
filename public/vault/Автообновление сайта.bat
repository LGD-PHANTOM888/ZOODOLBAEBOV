@echo off
title AUTO UPDATE SITE
cd /d "D:\tests_new\astro-garden"

echo.
echo  ============================================================
echo   AUTO UPDATE: Public -^> site -^> GitHub
echo   Watching source folder and publishing changes.
echo   Press Ctrl+C to stop.
echo  ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node 22 LTS: https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/2] Installing dependencies...
  call npm ci
  if errorlevel 1 goto fail
)

echo [2/2] Watching source folder...
node scripts/watch-sync.mjs
if errorlevel 1 goto fail
exit /b 0

:fail
echo.
echo [FAIL] Watcher stopped with an error.
pause
exit /b 1
