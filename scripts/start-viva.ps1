# start-viva.ps1
# Automates starting the local viva environment:
# 1. Verifies Ganache RPC (http://127.0.0.1:7545, Chain ID 1337)
# 2. Deploys fresh CropRegistry smart contract & auto-syncs deployment-info.json
# 3. Seeds demo users (farmer1, supplier1, retailer1, consumer1, admin1)
# 4. Starts FastAPI backend & Vue frontend
# 5. Tracks process IDs in scripts/.viva-pids.json for clean teardown

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PidFile = "$PSScriptRoot\.viva-pids.json"
$SpawnedPids = @()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Farm Traceability System — Starting Local Viva Suite" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check Ganache Connection
Write-Host "`n[1/4] Verifying Ganache RPC at http://127.0.0.1:7545..." -ForegroundColor Yellow
$rpcOnline = $false
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:7545" -Method Post -ContentType "application/json" -Body '{"jsonrpc":"2.0","method":"net_version","params":[],"id":1}' -TimeoutSec 3 -ErrorAction SilentlyContinue
    if ($res -and $res.result) {
        $rpcOnline = $true
        Write-Host "  [OK] Ganache RPC is active (Network ID: $($res.result))" -ForegroundColor Green
    }
} catch {
    $rpcOnline = $false
}

if (-not $rpcOnline) {
    Write-Host "  Ganache is not detected on port 7545. Attempting to start Ganache CLI..." -ForegroundColor Yellow
    try {
        $ganacheProc = Start-Process -FilePath "npx.cmd" -ArgumentList "ganache", "--server.port", "7545", "--chain.chainId", "1337" -PassThru -WindowStyle Hidden
        $SpawnedPids += $ganacheProc.Id
        Start-Sleep -Seconds 3
        Write-Host "  [OK] Started Ganache background process (PID: $($ganacheProc.Id))" -ForegroundColor Green
    } catch {
        Write-Warning "Could not start Ganache CLI automatically. Please ensure Ganache GUI or CLI is running at http://127.0.0.1:7545."
    }
}

# 2. Deploy CropRegistry Smart Contract
Write-Host "`n[2/4] Deploying CropRegistry smart contract to fresh chain..." -ForegroundColor Yellow
Push-Location "$ProjectRoot\blockchain"
try {
    & npx hardhat run scripts/deploy.js --network ganache
    Write-Host "  [OK] Smart contract deployed and metadata synchronized!" -ForegroundColor Green
} catch {
    Write-Warning "Smart contract deployment had warnings or errors. Check Ganache status."
} finally {
    Pop-Location
}

# 3. Seed Demo Users in Backend
Write-Host "`n[3/4] Ensuring demo accounts are seeded..." -ForegroundColor Yellow
$pythonExe = "$ProjectRoot\backend\.venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    $pythonExe = "python"
}
Push-Location "$ProjectRoot\backend"
try {
    & $pythonExe "app/seed_demo_users.py"
} catch {
    Write-Warning "User seeding completed with notices: $_"
} finally {
    Pop-Location
}

# 4. Start Backend & Frontend Services
Write-Host "`n[4/4] Starting FastAPI backend and Vue frontend..." -ForegroundColor Yellow

# Start FastAPI
$backendProc = Start-Process -FilePath $pythonExe -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload" -WorkingDirectory "$ProjectRoot\backend" -PassThru -WindowStyle Hidden
$SpawnedPids += $backendProc.Id
Write-Host "  [OK] FastAPI backend started (PID: $($backendProc.Id)) -> http://127.0.0.1:8000" -ForegroundColor Green

# Start Vite Frontend
$frontendProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" -WorkingDirectory "$ProjectRoot\frontend" -PassThru -WindowStyle Hidden
$SpawnedPids += $frontendProc.Id
Write-Host "  [OK] Vite dev server started (PID: $($frontendProc.Id)) -> http://localhost:5173" -ForegroundColor Green

# Save PIDs
$SpawnedPids | ConvertTo-Json | Out-File -FilePath $PidFile -Encoding utf8

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host " [VIVA ENVIRONMENT READY]" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Frontend Portal : http://localhost:5173" -ForegroundColor White
Write-Host " Backend API Docs: http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host " Ganache Testnet : http://127.0.0.1:7545 (Chain ID 1337)" -ForegroundColor White
Write-Host "`n Demo Accounts (Password: Demo12345!):" -ForegroundColor Cyan
Write-Host "  - Farmer   : farmer1" -ForegroundColor Gray
Write-Host "  - Supplier : supplier1" -ForegroundColor Gray
Write-Host "  - Retailer : retailer1" -ForegroundColor Gray
Write-Host "  - Consumer : consumer1 (or open public portal)" -ForegroundColor Gray
Write-Host "  - Admin    : admin1" -ForegroundColor Gray
Write-Host "`n To stop services safely, run: scripts\stop-viva.ps1" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
