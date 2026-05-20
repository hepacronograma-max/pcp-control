# Executa backup semanal do PCP Control (Supabase → OneDrive ou pasta local).
# Uso manual:  powershell -ExecutionPolicy Bypass -File scripts\run-weekly-backup.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Get-PcpBackupBase {
    $explicit = $env:PCP_BACKUP_DIR
    if ($explicit -and $explicit.Trim()) {
        return $explicit.Trim()
    }
    if ($env:PCP_BACKUP_ONEDRIVE -eq "0" -or $env:PCP_BACKUP_ONEDRIVE -eq "false") {
        return Join-Path $env:USERPROFILE "Backups\PCP-Control"
    }
    $candidates = @(
        $env:OneDrive,
        $env:ONEDRIVE,
        $env:OneDriveCommercial,
        $env:ONEDRIVECOMMERCIAL,
        $env:OneDriveConsumer,
        $env:ONEDRIVECONSUMER,
        (Join-Path $env:USERPROFILE "OneDrive"),
        (Join-Path $env:USERPROFILE "OneDrive - Empresa")
    ) | Where-Object { $_ -and $_.Trim() } | Select-Object -Unique
    foreach ($root in $candidates) {
        if (Test-Path -LiteralPath $root) {
            return Join-Path $root "Backups\PCP-Control"
        }
    }
    return Join-Path $env:USERPROFILE "Backups\PCP-Control"
}

$BackupBase = Get-PcpBackupBase
# Garante que o Node use a mesma pasta que este script
$env:PCP_BACKUP_DIR = $BackupBase

$LogDir = Join-Path $BackupBase "logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$logFile = Join-Path $LogDir "backup-$stamp.log"

function Write-Log([string]$msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Add-Content -Path $logFile -Value $line -Encoding UTF8
    Write-Host $line
}

Write-Log "Início do backup — projeto: $ProjectRoot"
Write-Log "Destino: $BackupBase (OneDrive sincroniza automaticamente se estiver nesta pasta)"

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Log "ERRO: Node.js não encontrado no PATH. Instale em https://nodejs.org"
    exit 1
}

Set-Location $ProjectRoot

if (-not (Test-Path ".env.local") -and -not (Test-Path ".env")) {
    Write-Log "ERRO: Falta .env.local com SUPABASE_SERVICE_ROLE_KEY"
    exit 1
}

try {
    & node "scripts\weekly-backup-supabase.js" 2>&1 | ForEach-Object {
        Write-Log $_
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERRO: script Node terminou com código $LASTEXITCODE"
        exit $LASTEXITCODE
    }
} catch {
    Write-Log "ERRO: $($_.Exception.Message)"
    exit 1
}

$latestFile = Join-Path $BackupBase "latest.txt"
if (Test-Path $latestFile) {
    $latestDir = (Get-Content $latestFile -TotalCount 1).Trim()
    if ($latestDir -and (Test-Path $latestDir)) {
        $zipPath = "$latestDir.zip"
        if (-not (Test-Path $zipPath)) {
            Write-Log "Criando ZIP: $zipPath"
            Compress-Archive -Path $latestDir -DestinationPath $zipPath -CompressionLevel Optimal
        }
    }
}

Write-Log "Backup finalizado. Verifique o ícone do OneDrive (nuvem verde = sincronizado)."
exit 0
