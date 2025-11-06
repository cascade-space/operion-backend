# Fix Windows Build Error - Clean and Reinstall Dependencies
# Run this script in PowerShell from the operion-backend directory

Write-Host "Cleaning node_modules and package-lock.json..." -ForegroundColor Yellow

# Remove node_modules and package-lock.json
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules"
    Write-Host "✓ Removed node_modules" -ForegroundColor Green
}

if (Test-Path "package-lock.json") {
    Remove-Item -Force "package-lock.json"
    Write-Host "✓ Removed package-lock.json" -ForegroundColor Green
}

# Clear npm cache
Write-Host "Clearing npm cache..." -ForegroundColor Yellow
npm cache clean --force

# Reinstall dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

# Build
Write-Host "Building project..." -ForegroundColor Yellow
npm run build

Write-Host "✓ Build complete!" -ForegroundColor Green

