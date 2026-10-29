# setup-viva.ps1
# Automates prerequisite verification and dependency installation for fresh local viva demonstration.

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Farm Traceability System - Local Viva Setup" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Project Root: $ProjectRoot`n"

# 1. Verify Node.js
Write-Host "[1/5] Checking Node.js runtime..." -ForegroundColor Yellow
try {
    $nodeVer = & node -v
    Write-Host "  [OK] Node.js is installed ($nodeVer)" -ForegroundColor Green
} catch {
    Write-Error "Node.js is not found on PATH. Please install Node.js v18+ to proceed."
}

# 2. Verify Python
Write-Host "[2/5] Checking Python runtime..." -ForegroundColor Yellow
try {
    $pyVer = & python --version
    Write-Host "  [OK] Python is installed ($pyVer)" -ForegroundColor Green
} catch {
    Write-Error "Python is not found on PATH. Please install Python 3.10+ to proceed."
}

# 3. Setup Blockchain dependencies
Write-Host "`n[3/5] Installing Blockchain dependencies..." -ForegroundColor Yellow
Push-Location "$ProjectRoot\blockchain"
try {
    & npm install --no-audit --no-fund
    Write-Host "  [OK] Blockchain dependencies installed." -ForegroundColor Green
} finally {
    Pop-Location
}

# 4. Setup Backend Virtual Environment & Dependencies
Write-Host "`n[4/5] Setting up Backend Python environment..." -ForegroundColor Yellow
$venvDir = "$ProjectRoot\backend\.venv"

if (-not (Test-Path "$venvDir\Scripts\python.exe")) {
    Write-Host "  Creating virtual environment at backend\.venv..."
    & python -m venv "$venvDir"
}

$pipExe = "$venvDir\Scripts\pip.exe"

if (Test-Path $pipExe) {
    Write-Host "  Installing backend requirements..."
    & $pipExe install -r "$ProjectRoot\backend\requirements.txt" --quiet
    Write-Host "  [OK] Backend dependencies installed." -ForegroundColor Green
} else {
    Write-Warning "Could not find virtual environment pip. Using global pip if available..."
    & pip install -r "$ProjectRoot\backend\requirements.txt" --quiet
}

# 5. Setup Frontend dependencies
Write-Host "`n[5/5] Installing Frontend dependencies..." -ForegroundColor Yellow
Push-Location "$ProjectRoot\frontend"
try {
    & npm install --no-audit --no-fund
    Write-Host "  [OK] Frontend dependencies installed." -ForegroundColor Green
} finally {
    Pop-Location
}

# Verify / initialize environment files
if (-not (Test-Path "$ProjectRoot\blockchain\.env")) {
    Set-Content -Path "$ProjectRoot\blockchain\.env" -Value "GANACHE_URL=http://127.0.0.1:7545`nGANACHE_CHAIN_ID=1337"
    Write-Host "  Created blockchain\.env" -ForegroundColor Gray
}

if (-not (Test-Path "$ProjectRoot\frontend\.env")) {
    Set-Content -Path "$ProjectRoot\frontend\.env" -Value "VITE_API_BASE_URL=http://127.0.0.1:8000"
    Write-Host "  Created frontend\.env" -ForegroundColor Gray
}

if (-not (Test-Path "$ProjectRoot\backend\.env")) {
    $jwtBytes = New-Object byte[] 32
    (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($jwtBytes)
    $jwtHex = [System.BitConverter]::ToString($jwtBytes).Replace("-", "").ToLower()
    $backendEnv = @"
DATABASE_URL=sqlite:///farm_traceability.db
GANACHE_RPC_URL=http://127.0.0.1:7545
GANACHE_CHAIN_ID=1337
GANACHE_CONTRACT_ADDRESS=0x59d3631c86BbE35EF041872d502F218A39FBa150
API_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
JWT_SECRET=$jwtHex
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440
"@
    Set-Content -Path "$ProjectRoot\backend\.env" -Value $backendEnv
    Write-Host "  Created backend\.env configured for local SQLite and Ganache." -ForegroundColor Gray
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host " [SUCCESS] Setup complete!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Next command:"
Write-Host "powershell -ExecutionPolicy Bypass -File scripts\start-viva.ps1" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
