# PowerShell скрипт для автоматической настройки файрвола Windows
# Запуск: powershell -ExecutionPolicy Bypass -File setup-firewall.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   🔥 Настройка файрвола Windows" -ForegroundColor Yellow
Write-Host "   Redskord Messenger" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Проверка прав администратора
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ОШИБКА] Этот скрипт требует прав администратора!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Пожалуйста запустите PowerShell от имени администратора и выполните:" -ForegroundColor Yellow
    Write-Host "Set-ExecutionPolicy Bypass -Scope Process" -ForegroundColor Green
    Write-Host ".\setup-firewall.ps1" -ForegroundColor Green
    Write-Host ""
    pause
    exit 1
}

$PORT = 3000
$RULE_NAME = "Redskord_Messenger_Port_$PORT"

Write-Host "[INFO] Открытие порта $PORT в файрволе Windows..." -ForegroundColor Cyan
Write-Host ""

# Удаляем старое правило если существует
Remove-NetFirewallRule -DisplayName $RULE_NAME -ErrorAction SilentlyContinue

# Добавляем новое правило для входящих подключений
try {
    New-NetFirewallRule -DisplayName $RULE_NAME -Direction Inbound -LocalPort $PORT -Protocol TCP -Action Allow | Out-Null
    Write-Host "[✓] Правило для входящих подключений создано успешно" -ForegroundColor Green
} catch {
    Write-Host "[✗] Ошибка при создании правила для входящих подключений" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

# Добавляем правило для исходящих подключений
try {
    New-NetFirewallRule -DisplayName "$RULE_NAME`_Out" -Direction Outbound -LocalPort $PORT -Protocol TCP -Action Allow | Out-Null
    Write-Host "[✓] Правило для исходящих подключений создано успешно" -ForegroundColor Green
} catch {
    Write-Host "[✗] Ошибка при создании правила для исходящих подключений" -ForegroundColor Red
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   ✅ Настройка завершена!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Порт $PORT открыт в файрволе Windows." -ForegroundColor Green
Write-Host "Теперь настройте Port Forwarding на роутере." -ForegroundColor Yellow
Write-Host ""
Write-Host "Ваш локальный IP адрес:" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*"} | Select-Object IPAddress, InterfaceAlias | Format-Table -AutoSize
Write-Host ""
pause

