# Registra tarefa no Agendador do Windows: backup semanal do PCP Control.
# Execute como Administrador OU usuário normal (tarefa roda na sua conta):
#   powershell -ExecutionPolicy Bypass -File scripts\register-weekly-backup-task.ps1

param(
    [string]$Day = "Sunday",
    [string]$Time = "03:00",
    [string]$TaskName = "PCP Control - Backup Semanal"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RunnerScript = Join-Path $ProjectRoot "scripts\run-weekly-backup.ps1"

if (-not (Test-Path $RunnerScript)) {
    Write-Error "Arquivo não encontrado: $RunnerScript"
}

$powershell = (Get-Command powershell.exe).Source
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$RunnerScript`""

$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $Day -At $Time
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
    -Description "Backup JSON do Supabase (PCP Control) para OneDrive\Backups\PCP-Control (sincroniza na nuvem)" `
    -RunLevel Limited | Out-Null

Write-Host ""
Write-Host "Tarefa criada: $TaskName"
Write-Host "  Quando: todo $Day às $Time"
Write-Host "  Script: $RunnerScript"
Write-Host "  Destino dos backups: $env:USERPROFILE\Backups\PCP-Control"
Write-Host ""
Write-Host "Testar agora:"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$RunnerScript`""
Write-Host ""
Write-Host "Ver no Agendador: taskschd.msc"
