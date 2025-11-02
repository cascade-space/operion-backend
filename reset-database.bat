@echo off
echo.
echo 🗑️  Database Reset Script
echo This will DELETE ALL DATA except super admin credentials!
echo.
set /p confirmation="Are you sure you want to continue? Type YES to confirm: "
if not "%confirmation%"=="YES" (
    echo ❌ Operation cancelled
    pause
    exit /b 0
)

echo.
echo 🔄 Starting database reset...
echo.

npm run reset

if %errorlevel% equ 0 (
    echo.
    echo ✅ Database reset completed successfully!
    echo 🔑 Super admin credentials have been preserved
    echo.
    echo Next steps:
    echo 1. Run 'npm run seed' to populate with test data
    echo 2. Start the server with 'npm run dev'
) else (
    echo ❌ Database reset failed
)

echo.
pause
