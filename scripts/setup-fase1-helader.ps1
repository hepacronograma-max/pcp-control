# Fase 1 — auxilia tarefas manuais (backup, SQL, GitHub)
# Uso: powershell -ExecutionPolicy Bypass -File scripts\setup-fase1-helader.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

. (Join-Path $PSScriptRoot "lib\open-supabase-sql-chrome.ps1")

$sqlFile = Join-Path $root "supabase\migrations\20260520_audit_log.sql"

Write-Host "=== Fase 1 — Setup ===" -ForegroundColor Cyan
Write-Host "Supabase: use Chrome (perfil HEPA), NAO Edge com perfil pessoal." -ForegroundColor Yellow

Write-Host "`n[1/3] Backup semanal..." -ForegroundColor Yellow
npm run backup:weekly
if ($LASTEXITCODE -ne 0) { throw "Backup falhou" }

Write-Host "`n[2/3] Migration audit_log..." -ForegroundColor Yellow
if (-not (Test-Path $sqlFile)) { throw "Arquivo SQL ausente: $sqlFile" }
$sql = Get-Content $sqlFile -Raw -Encoding UTF8
Set-Clipboard -Value $sql
Write-Host "SQL copiado para a area de transferencia." -ForegroundColor Green
$ref = Open-SupabaseSqlEditorChrome -ProjectRoot $root
Write-Host @"

No Chrome (conta HEPA no Supabase):
  1) Confirme que o projeto no topo e o PCP Control ($ref)
  2) Cole o SQL (Ctrl+V) e Run

Alternativa sem navegador:
  node scripts/apply-audit-migration.js
"@

Write-Host "`n[3/3] Branch protection GitHub..." -ForegroundColor Yellow
$ghCmd = Get-Command gh -ErrorAction SilentlyContinue
if (-not $ghCmd) {
    Write-Host "Instale: winget install GitHub.cli" -ForegroundColor Red
    exit 0
}

$null = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Execute: gh auth login" -ForegroundColor Yellow
    Write-Host "Depois rode este script de novo." -ForegroundColor Yellow
    exit 0
}

$repo = "hepacronograma-max/pcp-control"
$bodyPath = Join-Path $env:TEMP "pcp-branch-protection.json"
@'
{
  "required_status_checks": {
    "strict": true,
    "contexts": []
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
'@ | Set-Content -Path $bodyPath -Encoding UTF8

gh api "repos/$repo/branches/master/protection" -X PUT --input $bodyPath
if ($LASTEXITCODE -eq 0) {
    Write-Host "Branch protection aplicada (revise checks Vercel no GitHub se necessario)." -ForegroundColor Green
} else {
    Write-Host "Configure manualmente: GitHub -> Settings -> Branches -> master" -ForegroundColor Yellow
}

Write-Host "`nRotacao chaves: docs/SEGURANCA-PRODUCAO.md (painel Supabase + Vercel)." -ForegroundColor Cyan
