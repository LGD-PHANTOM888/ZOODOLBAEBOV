@echo off
cd /d "%~dp0"
echo.
echo  UPDATE ALL: Public -^> news -^> build -^> all repositories
echo  NW / RF / UKR / RB + main site
echo.

if not exist "D:\tests_new\astro-garden\update-site.bat" (
  echo [ERROR] D:\tests_new\astro-garden\update-site.bat not found
  pause
  exit /b 1
)

call "D:\tests_new\astro-garden\update-site.bat"
exit /b %errorlevel%
