@echo off
chcp 65001 >nul
setlocal EnableExtensions
title AUTO UPDATE SITE

set "PROJECT=D:\tests_new\astro-garden"
if defined SITE_DIR set "PROJECT=%SITE_DIR%"

if not exist "%PROJECT%\scripts\watch-sync.mjs" (
  echo [ERROR] %PROJECT%\scripts\watch-sync.mjs not found
  echo        Set SITE_DIR to the folder with watch-sync.mjs
  pause
  endlocal & exit /b 1
)

cd /d "%PROJECT%"
if errorlevel 1 (
  echo [ERROR] Cannot access %PROJECT%
  pause
  endlocal & exit /b 1
)

echo.
echo  ============================================================
echo   AUTO UPDATE: Public -^> site -^> GitHub Pages + media repos
echo   Watching source folder and publishing changes.
echo   Press Ctrl+C to stop.
echo  ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node 22 LTS: https://nodejs.org
  pause
  endlocal & exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found. Install Node 22 LTS: https://nodejs.org
  pause
  endlocal & exit /b 1
)

if not exist "node_modules\astro\package.json" (
  echo [1/2] Installing dependencies...
  call npm ci
  if errorlevel 1 goto fail
)

echo [2/2] Watching source folder...
node scripts\watch-sync.mjs %*
if errorlevel 1 goto fail

endlocal & exit /b 0

:fail
echo.
echo [FAIL] Watcher stopped with an error.
pause
endlocal & exit /b 1
