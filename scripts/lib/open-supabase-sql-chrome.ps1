# Abre o SQL Editor do Supabase no Chrome (modo convidado).
# NAO usar Edge nem o navegador padrao — outro perfil Microsoft pode abrir outro projeto Supabase.
#
# Uso: . .\scripts\lib\open-supabase-sql-chrome.ps1
#      Open-SupabaseSqlEditorChrome

function Get-PcpSupabaseProjectRef {
    param([string]$ProjectRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
    $envFile = Join-Path $ProjectRoot ".env.local"
    if (-not (Test-Path $envFile)) {
        $envFile = Join-Path $ProjectRoot ".env"
    }
    if (-not (Test-Path $envFile)) {
        throw "Nao encontrado .env.local nem .env em $ProjectRoot"
    }
    foreach ($line in Get-Content $envFile -Encoding UTF8) {
        if ($line -match '^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)\s*$') {
            $url = $matches[1].Trim().Trim('"').Trim("'")
            if ($url -match '([a-z0-9]{10,})\.supabase\.co') {
                return $matches[1]
            }
        }
    }
    throw "NEXT_PUBLIC_SUPABASE_URL invalido ou ausente em $envFile"
}

function Get-ChromeExecutable {
    $candidates = @(
        "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    foreach ($p in $candidates) {
        if ($p -and (Test-Path -LiteralPath $p)) { return $p }
    }
    return $null
}

function Open-SupabaseSqlEditorChrome {
    param(
        [string]$ProjectRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
    )
    $ref = Get-PcpSupabaseProjectRef -ProjectRoot $ProjectRoot
    $url = "https://supabase.com/dashboard/project/$ref/sql/new"
    $chrome = Get-ChromeExecutable
    if (-not $chrome) {
        Write-Host "Chrome nao encontrado. Abra manualmente (modo convidado ou perfil HEPA):" -ForegroundColor Yellow
        Write-Host $url
        Start-Process $url
        return $ref
    }
    Write-Host "Projeto Supabase (do .env.local): $ref" -ForegroundColor Cyan
    Write-Host "Abrindo Chrome modo convidado (sem perfil Edge)..." -ForegroundColor Green
    Write-Host "Faca login na conta HEPA se o Supabase pedir." -ForegroundColor Yellow
    Start-Process -FilePath $chrome -ArgumentList @("--guest", $url)
    return $ref
}
