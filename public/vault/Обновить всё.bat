@echo off
setlocal EnableExtensions
title UPDATE ALL
cd /d "%~dp0"

set "PROJECT=D:\tests_new\astro-garden"
if defined SITE_DIR set "PROJECT=%SITE_DIR%"

echo.
echo  One click: Public -^> site -^> 7 repositories
echo  NW / RF / UKR / RB / DANILO / MAKARO + main site
echo.

if not exist "%PROJECT%\update-site.bat" (
  echo [ERROR] %PROJECT%\update-site.bat not found
  echo        Set SITE_DIR to the folder with update-site.bat
  pause
  endlocal & exit /b 1
)

call "%PROJECT%\update-site.bat" /NOPAUSE %*
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo [FAIL] Update failed. Code %RC%. Window stays open.
  pause
)
endlocal & exit /b %RC%
