# Node.js auto-install and PATH refresh
# Usage: .\setup-node.ps1

function Refresh-Path {
    $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:PATH    = "$machinePath;$userPath"
}

Refresh-Path

$nodeExists = $null
try { $nodeExists = & node --version 2>$null } catch {}

if ($nodeExists) {
    Write-Host "[OK] Node.js $nodeExists already installed" -ForegroundColor Green
} else {
    Write-Host "[...] Node.js not found - installing LTS via winget..." -ForegroundColor Yellow

    winget install OpenJS.NodeJS.LTS `
        --silent `
        --accept-package-agreements `
        --accept-source-agreements

    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] winget install failed (exit code $LASTEXITCODE)" -ForegroundColor Red
        Write-Host "Manual install: https://nodejs.org" -ForegroundColor Yellow
        exit 1
    }

    Refresh-Path

    $nodeVersion = & node --version 2>$null
    if ($nodeVersion) {
        Write-Host "[OK] Node.js $nodeVersion installed successfully" -ForegroundColor Green
    } else {
        Write-Host "[WARN] Installed but PATH not updated - restart terminal" -ForegroundColor Yellow
        exit 1
    }
}

$npmVersion = & npm --version 2>$null
if ($npmVersion) {
    Write-Host "[OK] npm v$npmVersion" -ForegroundColor Green
} else {
    Write-Host "[WARN] npm not found" -ForegroundColor Yellow
}