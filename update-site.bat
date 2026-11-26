@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title СИНХРОНИЗАЦИЯ ХОЛСТОВ
cd /d "%~dp0"

echo.
echo  ============================================================
echo   ИСТОЧНИК -^> ХОЛСТЫ -^> СБОРКА -^> ВСЕ РЕПОЗИТОРИИ
echo   один клик: Новинки / РФ / УКР / РБ и основной сайт обновляются вместе
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

echo [3/4] Publishing media repos and main site...
node scripts/publish.mjs
if errorlevel 1 goto fail

echo [4/4] Done.
goto done

:fail
echo.
echo [FAIL] Sync/build/publish failed. See errors above.
echo        If media repos are missing, run: npm run setup:media
pause
exit /b 1

:done
echo.
echo [OK] Ready. Output: dist\
echo      Media: ZOODOLBAEBOV-NW / -RF / -UKR / -RB
echo      Main:  ZOODOLBAEBOV
echo      GitHub Pages deploys automatically after push.
echo.
pause
