@echo off
setlocal EnableExtensions
title UPDATE ALL
cd /d "%~dp0"

set "PROJECT=D:\tests_new\astro-garden"
if defined SITE_DIR set "PROJECT=%SITE_DIR%"

echo.
echo  UPDATE ALL: Public -^> news -^> build -^> all repositories
echo  NW / RF / UKR / RB + main site
echo.

if not exist "%PROJECT%\update-site.bat" (
  echo [ERROR] %PROJECT%\update-site.bat not found
  echo        Set SITE_DIR to the folder with update-site.bat
  pause
  endlocal & exit /b 1
)

call "%PROJECT%\update-site.bat"
set "RC=%ERRORLEVEL%"
endlocal & exit /b %RC%
