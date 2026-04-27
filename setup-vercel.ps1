# Vercel CLI auto-install and login
# Usage: .\setup-vercel.ps1
# Requires: Node.js + npm (run setup-node.ps1 first if needed)

function Refresh-Path {
    $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:PATH    = "$machinePath;$userPath"
}

Refresh-Path

# Check npm prerequisite
$npmExists = $null
try { $npmExists = & npm --version 2>$null } catch {}
if (-not $npmExists) {
    Write-Host "[ERROR] npm not found - run setup-node.ps1 first" -ForegroundColor Red
    exit 1
}

# Check if vercel is installed
$vercelExists = $null
try { $vercelExists = & vercel --version 2>$null } catch {}

if ($vercelExists) {
    Write-Host "[OK] Vercel CLI v$vercelExists already installed" -ForegroundColor Green
} else {
    Write-Host "[...] Vercel CLI not found - installing via npm..." -ForegroundColor Yellow

    & npm install -g vercel

    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] npm install failed (exit code $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }

    Refresh-Path

    $vercelVersion = & vercel --version 2>$null
    if ($vercelVersion) {
        Write-Host "[OK] Vercel CLI v$vercelVersion installed successfully" -ForegroundColor Green
    } else {
        Write-Host "[WARN] Installed but not on PATH - restart terminal" -ForegroundColor Yellow
        exit 1
    }
}

# Check login status
$whoami = & vercel whoami 2>&1
if ($LASTEXITCODE -eq 0 -and $whoami -notmatch "Error") {
    Write-Host "[OK] Already logged in as $whoami" -ForegroundColor Green
} else {
    Write-Host "[...] Not logged in - starting login flow..." -ForegroundColor Yellow
    & vercel login
    if ($LASTEXITCODE -eq 0) {
        $whoami = & vercel whoami 2>$null
        Write-Host "[OK] Login successful as $whoami" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Login failed" -ForegroundColor Red
        exit 1
    }
}