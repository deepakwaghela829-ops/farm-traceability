# stop-viva.ps1
# Stops only the background processes launched by start-viva.ps1 without terminating unrelated tools.

$PidFile = "$PSScriptRoot\.viva-pids.json"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Farm Traceability System — Stopping Local Viva Suite" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if (-not (Test-Path $PidFile)) {
    Write-Host "No active viva processes recorded in $PidFile." -ForegroundColor Yellow
    exit 0
}

try {
    $pids = Get-Content $PidFile | ConvertFrom-Json
    foreach ($procId in $pids) {
        try {
            $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($p) {
                Write-Host "Stopping process $($p.ProcessName) (PID: $procId)..." -ForegroundColor Yellow
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                Write-Host "  [OK] Stopped PID $procId" -ForegroundColor Green
            } else {
                Write-Host "Process PID $procId already exited." -ForegroundColor Gray
            }
        } catch {
            Write-Warning "Could not stop PID $procId : $_"
        }
    }
} finally {
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host "`nCleaned up PID tracking file." -ForegroundColor Gray
}

Write-Host "`nAll viva background processes terminated cleanly." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
