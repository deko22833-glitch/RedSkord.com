@echo off
chcp 65001 >nul
title Redskord Messenger Server (ngrok)
color 0B

echo ============================================
echo    🔴 Redskord Messenger Server
echo    🌍 С ngrok для доступа из интернета
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

REM Проверка наличия ngrok
where ngrok >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] ngrok не найден в PATH
    echo.
    echo Установка ngrok через npm...
    call npm install -g ngrok
    if %ERRORLEVEL% NEQ 0 (
        echo [ОШИБКА] Не удалось установить ngrok!
        echo.
        echo Пожалуйста, установите ngrok вручную:
        echo 1. Скачайте с https://ngrok.com/download
        echo 2. Распакуйте в папку проекта
        echo 3. Или добавьте в PATH
        echo.
        pause
        exit /b 1
    )
)

echo [INFO] Node.js найден
echo [INFO] ngrok найден
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
echo [INFO] Запуск ngrok туннеля...
echo.
echo ============================================
echo Сервер запускается...
echo ngrok создаст публичный адрес для доступа
echo Для остановки нажмите Ctrl+C
echo ============================================
echo.

REM Запуск сервера в фоне
start "Redskord Server" cmd /c "node server/index.js"

REM Небольшая задержка для запуска сервера
timeout /t 3 /nobreak >nul

REM Запуск ngrok
echo.
echo 🌍 Создание публичного туннеля...
echo.
ngrok http 3000

pause

