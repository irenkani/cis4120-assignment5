# Clear React cache and restart
Write-Host "Clearing React cache..." -ForegroundColor Yellow

# Stop any running Node processes
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# Remove cache directories
if (Test-Path "node_modules\.cache") {
    Remove-Item -Recurse -Force "node_modules\.cache"
    Write-Host "✓ Cleared node_modules/.cache" -ForegroundColor Green
}

if (Test-Path ".cache") {
    Remove-Item -Recurse -Force ".cache"
    Write-Host "✓ Cleared .cache" -ForegroundColor Green
}

if (Test-Path "build") {
    Remove-Item -Recurse -Force "build"
    Write-Host "✓ Cleared build folder" -ForegroundColor Green
}

Write-Host "`nCache cleared! Now run: npm start" -ForegroundColor Cyan

