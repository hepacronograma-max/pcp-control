# Inventário do repositório (sem apagar nada).
# Uso: npm run inventory:repo

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$exclude = '(\\node_modules\\|\\.next\\|\\.git\\)'
$files = Get-ChildItem -Recurse -File -EA SilentlyContinue |
  Where-Object { $_.FullName -notmatch $exclude }

$sum = ($files | Measure-Object Length -Sum)
Write-Host "=== PCP Control — inventario ===" -ForegroundColor Cyan
Write-Host ("Arquivos (sem node_modules/.next): {0}" -f $sum.Count)
Write-Host ("Tamanho total: {0:N2} MB" -f ($sum.Sum / 1MB))

Write-Host "`n=== Maiores 12 arquivos ===" -ForegroundColor Yellow
$files | Sort-Object Length -Descending | Select-Object -First 12 |
  ForEach-Object { "{0,8:N2} KB  {1}" -f ($_.Length / 1KB), $_.FullName.Replace($root + "\", "") }

Write-Host "`n=== Markdown na raiz ===" -ForegroundColor Yellow
Get-ChildItem -Path $root -Filter "*.md" -File | ForEach-Object {
  "{0,6:N1} KB  {1}" -f ($_.Length / 1KB), $_.Name
}

Write-Host "`n=== Dados locais (nao commitados) ===" -ForegroundColor Yellow
@(
  "backup-pcp.json",
  "secrets",
  ".env",
  ".env.local"
) | ForEach-Object {
  $p = Join-Path $root $_
  if (Test-Path $p) {
    if ((Get-Item $p).PSIsContainer) {
      $s = (Get-ChildItem $p -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum
      Write-Host ("  [pasta] {0} — {1:N2} MB" -f $_, ($s / 1MB))
    } else {
      $s = (Get-Item $p).Length
      Write-Host ("  [arquivo] {0} — {1:N2} KB" -f $_, ($s / 1KB))
    }
  } else {
    Write-Host ("  (ausente) {0}" -f $_)
  }
}

$oneDrive = Join-Path $env:USERPROFILE "OneDrive\Backups\PCP-Control\latest.txt"
if (Test-Path $oneDrive) {
  Write-Host "`n=== Ultimo backup OneDrive ===" -ForegroundColor Green
  Get-Content $oneDrive
}

Write-Host "`nNenhum arquivo foi alterado ou removido." -ForegroundColor Green
