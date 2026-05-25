# Registra tarefa no Agendador do Windows: backup DIÁRIO do PCP Control.
# NÃO executa o backup — apenas cria a tarefa.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\register-daily-backup-task.ps1

param(
    [string]$Time = "22:00",
    [string]$TaskName = "PCP Control - Backup Diário"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RunnerScript = Join-Path $ProjectRoot "scripts\run-daily-backup.ps1"

if (-not (Test-Path $RunnerScript)) {
    Write-Error "Arquivo não encontrado: $RunnerScript"
}

$powershell = (Get-Command powershell.exe).Source
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$RunnerScript`""

$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Tarefa anterior removida."
}

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Backup diário incremental Supabase → Backups\PCP-Control\daily (espelha OneDrive se configurado)" `
    -RunLevel Limited | Out-Null

Write-Host ""
Write-Host "Tarefa criada: $TaskName"
Write-Host "  Quando: todos os dias às $Time"
Write-Host "  Script: $RunnerScript"
Write-Host "  Logs: $ProjectRoot\scripts\logs\"
Write-Host ""
Write-Host "Testar agora:"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$RunnerScript`""
Write-Host ""
Write-Host "Ver no Agendador: taskschd.msc"
