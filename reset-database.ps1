# Database Reset Script
# This script will completely reset the database, keeping only super admin credentials

Write-Host "🗑️  Database Reset Script" -ForegroundColor Red
Write-Host "This will DELETE ALL DATA except super admin credentials!" -ForegroundColor Yellow
Write-Host ""

# Ask for confirmation
$confirmation = Read-Host "Are you sure you want to continue? Type 'YES' to confirm"
if ($confirmation -ne "YES") {
    Write-Host "❌ Operation cancelled" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "🔄 Starting database reset..." -ForegroundColor Green

try {
    # Run the reset script
    npm run reset
    
    Write-Host ""
    Write-Host "✅ Database reset completed successfully!" -ForegroundColor Green
    Write-Host "🔑 Super admin credentials have been preserved" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Blue
    Write-Host "1. Run 'npm run seed' to populate with test data" -ForegroundColor White
    Write-Host "2. Start the server with 'npm run dev'" -ForegroundColor White
    
} catch {
    Write-Host "❌ Database reset failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Read-Host "Press Enter to continue"
