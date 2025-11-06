@echo off
chcp 65001 >nul
title Redskord - Загрузка на GitHub
color 0B

echo ============================================
echo    📤 Загрузка Redskord на GitHub
echo ============================================
echo.

REM Проверка наличия Git
where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ОШИБКА] Git не установлен!
    echo.
    echo Установите Git for Windows:
    echo https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

echo [INFO] Git найден
echo.

REM Проверка, инициализирован ли репозиторий
if not exist ".git\" (
    echo [INFO] Инициализация Git репозитория...
    git init
    git branch -M main
    echo [✓] Репозиторий инициализирован
    echo.
)

REM Добавление всех файлов
echo [INFO] Добавление файлов...
git add .
echo [✓] Файлы добавлены
echo.

REM Проверка статуса
git status --short
echo.

REM Запрос на коммит
set /p COMMIT_MSG="Введите сообщение коммита (или Enter для 'Initial commit'): "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Initial commit: Redskord Messenger

echo.
echo [INFO] Создание коммита...
git commit -m "%COMMIT_MSG%"
if %ERRORLEVEL% NEQ 0 (
    echo [ОШИБКА] Не удалось создать коммит
    echo Возможно, нет изменений для коммита
    echo.
    pause
    exit /b 1
)
echo [✓] Коммит создан
echo.

REM Проверка наличия remote
git remote -v | findstr "origin" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ============================================
    echo    Настройка подключения к GitHub
    echo ============================================
    echo.
    echo 1. Создайте новый репозиторий на GitHub:
    echo    https://github.com/new
    echo.
    echo 2. Название репозитория: Redskord (или любое другое)
    echo.
    echo 3. НЕ добавляйте README, .gitignore или лицензию
    echo    (они уже есть в проекте)
    echo.
    echo 4. Скопируйте URL репозитория (например):
    echo    https://github.com/deko22833-glitch/Redskord.git
    echo.
    set /p REPO_URL="Введите URL вашего репозитория: "
    
    if "%REPO_URL%"=="" (
        echo [ОШИБКА] URL не введен
        pause
        exit /b 1
    )
    
    echo.
    echo [INFO] Добавление remote репозитория...
    git remote add origin "%REPO_URL%"
    echo [✓] Remote добавлен
    echo.
)

REM Отправка на GitHub
echo ============================================
echo    Отправка на GitHub
echo ============================================
echo.
echo [INFO] Отправка кода на GitHub...
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================
    echo    ✅ УСПЕШНО ЗАГРУЖЕНО НА GITHUB!
    echo ============================================
    echo.
    echo Ваш проект доступен по адресу:
    git remote get-url origin
    echo.
    echo Теперь можете деплоить на Render или Railway!
    echo.
) else (
    echo.
    echo [ОШИБКА] Не удалось отправить на GitHub
    echo.
    echo Возможные причины:
    echo 1. Неверный URL репозитория
    echo 2. Нет прав доступа (проверьте авторизацию)
    echo 3. Репозиторий не существует
    echo.
    echo Для авторизации используйте:
    echo git config --global user.name "Ваше имя"
    echo git config --global user.email "ваш@email.com"
    echo.
    echo Или используйте GitHub Desktop:
    echo https://desktop.github.com/
    echo.
)

pause

