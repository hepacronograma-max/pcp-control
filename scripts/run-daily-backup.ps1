# Executa backup diário do PCP Control (Supabase → Backups\PCP-Control\daily).
# Uso manual: powershell -ExecutionPolicy Bypass -File scripts\run-daily-backup.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

$DailyBase = if ($env:PCP_DAILY_BACKUP_DIR -and $env:PCP_DAILY_BACKUP_DIR.Trim()) {
    $env:PCP_DAILY_BACKUP_DIR.Trim()
} else {
    Join-Path $env:USERPROFILE "Backups\PCP-Control\daily"
}

$LogDir = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$stamp = Get-Date -Format "yyyy-MM-dd"
$logFile = Join-Path $LogDir "daily-backup-$stamp.log"

function Write-Log([string]$msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Add-Content -Path $logFile -Value $line -Encoding UTF8
    Write-Host $line
}

Write-Log "Início backup diário — projeto: $ProjectRoot"
Write-Log "Destino: $DailyBase"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Log "ERRO: Node.js não encontrado no PATH."
    exit 1
}

Set-Location $ProjectRoot

if (-not (Test-Path ".env.local") -and -not (Test-Path ".env")) {
    Write-Log "ERRO: Falta .env.local com credenciais Supabase"
    exit 1
}

try {
    & node "scripts\daily-backup-supabase.js" 2>&1 | ForEach-Object { Write-Log $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERRO: script Node terminou com código $LASTEXITCODE"
        exit $LASTEXITCODE
    }
} catch {
    Write-Log "ERRO: $($_.Exception.Message)"
    exit 1
}

Write-Log "Backup diário finalizado."
exit 0
