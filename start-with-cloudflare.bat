@echo off
chcp 65001 >nul
title Redskord Messenger Server (Cloudflare Tunnel)
color 0C

echo ============================================
echo    🔴 Redskord Messenger Server
echo    🌍 С Cloudflare Tunnel для мобильных
echo ============================================
echo.

REM Проверка наличия Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ОШИБКА] Node.js не установлен!
    echo Пожалуйста, установите Node.js с https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Проверка наличия cloudflared
where cloudflared >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] cloudflared не найден в PATH
    echo.
    echo Установка cloudflared:
    echo 1. Скачайте с https://github.com/cloudflare/cloudflared/releases
    echo 2. Распакуйте cloudflared.exe в папку проекта
    echo 3. Или добавьте в PATH
    echo.
    echo Или используйте автоматическую установку через powershell:
    echo powershell -Command "Invoke-WebRequest -Uri https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe -OutFile cloudflared.exe"
    echo.
    pause
    exit /b 1
)

echo [INFO] Node.js найден
echo [INFO] cloudflared найден
echo.

REM Проверка наличия node_modules
if not exist "node_modules\" (
    echo [INFO] Установка зависимостей...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ОШИБКА] Не удалось установить зависимости!
        pause
        exit /b 1
    )
    echo.
)

echo [INFO] Запуск сервера...
echo [INFO] Запуск Cloudflare Tunnel...
echo.
echo ============================================
echo Сервер запускается...
echo Cloudflare создаст публичный адрес
echo Доступен для мобильных провайдеров!
echo Для остановки нажмите Ctrl+C
echo ============================================
echo.

REM Запуск сервера в фоне
start "Redskord Server" cmd /c "node server/index.js"

REM Небольшая задержка для запуска сервера
timeout /t 3 /nobreak >nul

REM Запуск Cloudflare Tunnel
echo.
echo 🌍 Создание публичного туннеля для мобильных...
echo.
cloudflared tunnel --url http://localhost:3000

pause

