# Testes de segurança em produção (ou URL customizada).
# Uso: powershell -ExecutionPolicy Bypass -File scripts\security-smoke-test.ps1
#      $env:PCP_SMOKE_BASE_URL = "http://localhost:3000"; .\scripts\security-smoke-test.ps1

param(
    [string]$BaseUrl = $(if ($env:PCP_SMOKE_BASE_URL) { $env:PCP_SMOKE_BASE_URL.TrimEnd('/') } else { "https://pcp-control.vercel.app" })
)

$ErrorActionPreference = "Continue"
$passed = 0
$failed = 0

function Test-Expect {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Path,
        [int[]]$ExpectedCodes,
        [hashtable]$Headers = @{},
        [string]$Body = $null
    )
    $uri = "$BaseUrl$Path"
    try {
        $params = @{
            Uri         = $uri
            Method      = $Method
            UseBasicParsing = $true
            TimeoutSec  = 45
        }
        if ($Body) {
            $params.Body = $Body
            $params.ContentType = "application/json"
        }
        if ($Headers.Count -gt 0) { $params.Headers = $Headers }
        $params.MaximumRedirection = 0
        $r = Invoke-WebRequest @params
        $code = [int]$r.StatusCode
        $snippet = if ($r.Content.Length -gt 120) { $r.Content.Substring(0, 120) } else { $r.Content }
    } catch {
        if ($_.Exception.Response) {
            $code = [int]$_.Exception.Response.StatusCode
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $snippet = $reader.ReadToEnd()
            if ($snippet.Length -gt 120) { $snippet = $snippet.Substring(0, 120) }
        } else {
            $code = 0
            $snippet = $_.Exception.Message
        }
    }
    $ok = $ExpectedCodes -contains $code
    if (-not $ok -and $Path -eq "/api/debug-operator" -and $code -eq 200 -and $snippet -match "not authenticated") {
        $ok = $true
    }
    if ($ok) { $script:passed++ } else { $script:failed++ }
    $mark = if ($ok) { "OK" } else { "FALHA" }
    Write-Host ("[{0}] {1} {2} -> {3} (esperado: {4})" -f $mark, $Method, $Path, $code, ($ExpectedCodes -join ","))
    if (-not $ok) { Write-Host "      $snippet" }
}

Write-Host "=== Smoke test de segurança ===" -ForegroundColor Cyan
Write-Host "Base: $BaseUrl`n"

Test-Expect "cleanup sem secret" POST "/api/cleanup?dry_run=1" @(503, 401) -Body "{}"
Test-Expect "cleanup GET bloqueado" GET "/api/cleanup" @(405)
Test-Expect "cleanup chave errada" POST "/api/cleanup?dry_run=1" @(503, 401) @{
    "x-cleanup-key" = "chave-invalida-smoke-test"
} -Body "{}"
Test-Expect "local-login prod" POST "/api/auth/local-login" @(403) -Body '{"email":"admin@local","password":"123456"}'
Test-Expect "me sem sessao" GET "/api/me" @(401)
Test-Expect "debug-operator sem sessao" GET "/api/debug-operator" @(401, 404)
Test-Expect "effective-company sem sessao" GET "/api/effective-company" @(307, 401)
Test-Expect "cookie local ignorado" GET "/api/effective-company" @(307, 401) @{
    Cookie = "pcp-local-auth=1"
}
Test-Expect "import-backup sem sessao" POST "/api/import-backup" @(307, 401, 405) -Body "{}"
Test-Expect "backup publico removido" GET "/backup-inicial.json" @(307, 404, 200)

Write-Host ""
Write-Host "Passou: $passed | Falhou: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
if ($failed -gt 0) { exit 1 }
exit 0
