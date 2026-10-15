param([string]$Languages = 'en,yo')
$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
Set-Location (Split-Path -Parent $PSScriptRoot)
$python = Join-Path (Get-Location) '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { $python = 'py' }

function Invoke-Modal {
    param([string[]]$ModalArguments)
    & $python -m modal @ModalArguments
    if ($LASTEXITCODE -ne 0) { throw 'Modal command failed. Resolve the reported error before continuing.' }
}

Invoke-Modal -ModalArguments @('run', 'infra/natlas_tools.py', '--preflight')
Invoke-Modal -ModalArguments @('run', 'infra/natlas_tools.py', '--test-contract')
Invoke-Modal -ModalArguments @('run', 'infra/natlas_tools.py', '--runtime')
# Starts the actual app and downloads only the requested official models into its Volume.
Invoke-Modal -ModalArguments @('run', 'infra/modal_natlas_asr.py', '--languages', $Languages)
$deployment = & $python -m modal deploy infra/modal_natlas_asr.py 2>&1
$deployment | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed; no URL or success is assumed.' }
$match = [regex]::Match(($deployment -join "`n"), 'https://[a-zA-Z0-9.-]+\.modal\.run')
if (-not $match.Success) { throw 'Deployment succeeded but no endpoint URL was found. Inspect Modal output.' }
$baseUrl = $match.Value
Invoke-Modal -ModalArguments @('run', 'infra/natlas_tools.py', '--base-url', $baseUrl, '--configure-backend')
Invoke-Modal -ModalArguments @('run', 'infra/natlas_tools.py', '--base-url', $baseUrl, '--languages', $Languages, '--test-real')
Write-Host 'Deployment and real-audio tests passed. Restart the Beta Express backend.'
