@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
title UPDATE ALL SITES
cd /d "%~dp0"

set "NO_PAUSE="
for %%A in (%*) do (
  if /I "%%A"=="/NOPAUSE" set "NO_PAUSE=1"
)

echo.
echo  ============================================================
echo   SOURCE -^> CANVASES -^> BUILD -^> ALL REPOSITORIES
echo   one click: NW / RF / UKR / RB media + main site
echo  ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node 22 LTS: https://nodejs.org
  if not defined NO_PAUSE pause
  endlocal & exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found. Install Node 22 LTS: https://nodejs.org
  if not defined NO_PAUSE pause
  endlocal & exit /b 1
)

if not exist "package.json" (
  echo [ERROR] package.json not found in %CD%
  if not defined NO_PAUSE pause
  endlocal & exit /b 1
)

if not exist "package-lock.json" (
  echo [ERROR] package-lock.json not found in %CD%
  if not defined NO_PAUSE pause
  endlocal & exit /b 1
)

if not exist "scripts\sync-vault.mjs" (
  echo [ERROR] scripts\sync-vault.mjs not found
  if not defined NO_PAUSE pause
  endlocal & exit /b 1
)

if not exist "scripts\publish.mjs" (
  echo [ERROR] scripts\publish.mjs not found
  if not defined NO_PAUSE pause
  endlocal & exit /b 1
)

if not exist "node_modules\astro\package.json" (
  echo [1/4] Installing dependencies...
  call npm ci
  if errorlevel 1 goto fail
) else (
  echo [1/4] Dependencies: OK
)

echo [2/4] Syncing source and building site...
call npm run update
if errorlevel 1 goto fail

if not exist "dist\index.html" (
  echo [ERROR] Build output dist\index.html not found
  goto fail
)

echo [3/4] Publishing media repos and main site...
call node scripts\publish.mjs
if errorlevel 1 goto fail

echo [4/4] Done.
if not defined NO_PAUSE pause
endlocal & exit /b 0

:fail
echo.
echo [FAIL] Sync/build/publish failed. See errors above.
echo        If media repos are missing, run: npm run setup:media
if not defined NO_PAUSE pause
endlocal & exit /b 1
