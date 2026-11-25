@echo off
chcp 65001 >nul
title Обновление сайта
cd /d "%~dp0"
echo.
echo  Запуск синхронизации и публикации сайта...
echo  Источник: %cd%
echo.

if not exist "D:\tests_new\astro-garden\update-site.bat" (
  echo [ERROR] Не найден D:\tests_new\astro-garden\update-site.bat
  pause
  exit /b 1
)

call "D:\tests_new\astro-garden\update-site.bat"
exit /b %errorlevel%
