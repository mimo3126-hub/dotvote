# GitHub CLI auto-install and login
# Usage: .\setup-gh.ps1

function Refresh-Path {
    $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:PATH    = "$machinePath;$userPath"
}

Refresh-Path

# Check if gh is installed
$ghExists = $null
try { $ghExists = & gh --version 2>$null | Select-Object -First 1 } catch {}

if ($ghExists) {
    Write-Host "[OK] $ghExists already installed" -ForegroundColor Green
} else {
    Write-Host "[...] GitHub CLI not found - installing via winget..." -ForegroundColor Yellow

    winget install GitHub.cli `
        --silent `
        --accept-package-agreements `
        --accept-source-agreements

    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] winget install failed (exit code $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }

    Refresh-Path

    $ghVersion = & gh --version 2>$null | Select-Object -First 1
    if ($ghVersion) {
        Write-Host "[OK] $ghVersion installed successfully" -ForegroundColor Green
    } else {
        Write-Host "[WARN] Installed but PATH not updated - restart terminal" -ForegroundColor Yellow
        exit 1
    }
}

# Check login status
$authStatus = & gh auth status 2>&1
if ($authStatus -match "Logged in") {
    $account = ($authStatus | Select-String "account (\S+)").Matches.Groups[1].Value
    Write-Host "[OK] Already logged in as $account" -ForegroundColor Green
} else {
    Write-Host "[...] Not logged in - starting browser login..." -ForegroundColor Yellow
    & gh auth login --web --git-protocol https
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Login successful" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Login failed" -ForegroundColor Red
        exit 1
    }
}