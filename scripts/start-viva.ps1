# start-viva.ps1
# Automates starting and verifying the local viva environment.

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PidFile = "$PSScriptRoot\.viva-pids.json"
$SpawnedPids = @()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Farm Traceability System - Starting Local Viva Suite" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Ganache Check & Start
Write-Host "`n[1/5] Checking Ganache Testnet..." -ForegroundColor Yellow
$ganachePass = $false

for ($attempt = 1; $attempt -le 2; $attempt++) {
    try {
        $res = Invoke-RestMethod `
            -Uri "http://127.0.0.1:7545" `
            -Method Post `
            -ContentType "application/json" `
            -Body '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' `
            -TimeoutSec 3 `
            -ErrorAction SilentlyContinue

        if ($res -and $res.result) {
            $ganachePass = $true
            $rawId = $res.result
            $decId = if ($rawId -match "^0x") { [Convert]::ToInt32($rawId, 16) } else { [int]$rawId }
            Write-Host "  Ganache PASS (Chain ID: $decId at 127.0.0.1:7545)" -ForegroundColor Green
            break
        }
    }
    catch {
        $ganachePass = $false
    }

    if (-not $ganachePass -and $attempt -eq 1) {
        Write-Host "  Starting local Ganache process..." -ForegroundColor Gray
        try {
            $ganacheProc = Start-Process `
                -FilePath "npx.cmd" `
                -ArgumentList "ganache", "--server.port", "7545", "--chain.chainId", "1337", "--chain.networkId", "1337", "--wallet.deterministic" `
                -WorkingDirectory "$ProjectRoot\blockchain" `
                -PassThru `
                -WindowStyle Hidden
            $SpawnedPids += $ganacheProc.Id
            Start-Sleep -Seconds 6
        }
        catch {
            Write-Warning "Could not start Ganache automatically: $_"
        }
    }
}

if (-not $ganachePass) {
    Write-Host "  Ganache FAIL - Unable to connect to http://127.0.0.1:7545" -ForegroundColor Red
    exit 1
}

# 2. Deploy & Verify Smart Contract
Write-Host "`n[2/5] Deploying CropRegistry Smart Contract..." -ForegroundColor Yellow
$contractPass = $false

Push-Location "$ProjectRoot\blockchain"
try {
    & npx hardhat run scripts/deploy.js --network ganache
    if ($LASTEXITCODE -eq 0) {
        $contractPass = $true
        Write-Host "  Contract PASS (CropRegistry deployed and synchronized)" -ForegroundColor Green
    } else {
        Write-Host "  Contract FAIL (Hardhat deployment failed with exit code $LASTEXITCODE)" -ForegroundColor Red
    }
}
catch {
    Write-Host "  Contract FAIL ($_)" -ForegroundColor Red
}
finally {
    Pop-Location
}

if (-not $contractPass) {
    exit 1
}

# 3. Database Check & Demo User Seeding
Write-Host "`n[3/5] Verifying Database & Seeding Demo Accounts..." -ForegroundColor Yellow
$dbPass = $false

$pythonExe = "$ProjectRoot\backend\.venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    $pythonExe = "python"
}

Push-Location "$ProjectRoot\backend"
try {
    & $pythonExe "app/seed_demo_users.py"
    if ($LASTEXITCODE -eq 0) {
        $dbPass = $true
        Write-Host "  Database PASS (Relational schema verified, demo accounts active)" -ForegroundColor Green
    } else {
        Write-Host "  Database FAIL (User seeding returned exit code $LASTEXITCODE)" -ForegroundColor Red
    }
}
catch {
    Write-Host "  Database FAIL ($_)" -ForegroundColor Red
}
finally {
    Pop-Location
}

if (-not $dbPass) {
    exit 1
}

# 4. Start & Verify Backend Service
Write-Host "`n[4/5] Starting FastAPI Backend..." -ForegroundColor Yellow
$backendPass = $false

# Check if backend is already listening
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($health -and $health.status -eq "ok") {
        $backendPass = $true
    }
} catch {}

if (-not $backendPass) {
    $backendProc = Start-Process `
        -FilePath $pythonExe `
        -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000" `
        -WorkingDirectory "$ProjectRoot\backend" `
        -PassThru `
        -WindowStyle Hidden

    $SpawnedPids += $backendProc.Id

    for ($i = 1; $i -le 10; $i++) {
        Start-Sleep -Seconds 1
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($health -and $health.status -eq "ok") {
                $backendPass = $true
                break
            }
        } catch {}
    }
}

if ($backendPass) {
    Write-Host "  Backend PASS (FastAPI listening at http://127.0.0.1:8000)" -ForegroundColor Green
} else {
    Write-Host "  Backend FAIL - FastAPI backend did not respond at http://127.0.0.1:8000/health" -ForegroundColor Red
    exit 1
}

# 5. Start & Verify Frontend Service
Write-Host "`n[5/5] Starting Frontend (HTML/CSS/JavaScript)..." -ForegroundColor Yellow
$frontendPass = $false

# Check if frontend is already listening
try {
    $fe = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($fe -and $fe.StatusCode -eq 200) {
        $frontendPass = $true
    }
} catch {}

if (-not $frontendPass) {
    $frontendProc = Start-Process `
        -FilePath "npm.cmd" `
        -ArgumentList "run", "dev" `
        -WorkingDirectory "$ProjectRoot\frontend" `
        -PassThru `
        -WindowStyle Hidden

    $SpawnedPids += $frontendProc.Id

    for ($i = 1; $i -le 10; $i++) {
        Start-Sleep -Seconds 1
        try {
            $fe = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($fe -and $fe.StatusCode -eq 200) {
                $frontendPass = $true
                break
            }
        } catch {}
    }
}

if ($frontendPass) {
    Write-Host "  Frontend PASS (Vite dev server running at http://localhost:5173)" -ForegroundColor Green
} else {
    Write-Host "  Frontend FAIL - Vite dev server did not respond at http://localhost:5173" -ForegroundColor Red
    exit 1
}

# Save PIDs if any were spawned
if ($SpawnedPids.Count -gt 0) {
    $existingPids = @()
    if (Test-Path $PidFile) {
        try { $existingPids = Get-Content $PidFile | ConvertFrom-Json } catch {}
    }
    $allPids = @($existingPids) + @($SpawnedPids) | Select-Object -Unique
    $allPids | ConvertTo-Json | Out-File -FilePath $PidFile -Encoding utf8
}

# Final Verification Summary
if ($ganachePass -and $contractPass -and $dbPass -and $backendPass -and $frontendPass) {
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
} else {
    Write-Host "`n[ERROR] Environment could not be fully initialized." -ForegroundColor Red
    exit 1
}
