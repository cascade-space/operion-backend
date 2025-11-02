# Database Reset Script

This script completely resets the database while preserving super admin credentials.

## ⚠️ WARNING
**This will DELETE ALL DATA except super admin accounts!**

## What Gets Deleted
- All factories
- All products  
- All processes
- All machines
- All attendance records
- All work entries
- All users (except super admins)

## What Gets Preserved
- Super admin accounts
- Super admin credentials and login information

## How to Use

### Method 1: Using npm script
```bash
cd Backend
npm run reset
```

### Method 2: Using PowerShell script (Windows)
```powershell
cd Backend
.\reset-database.ps1
```

### Method 3: Direct execution
```bash
cd Backend
tsx src/scripts/reset-database.ts
```

## What Happens During Reset

1. **Connects to MongoDB** using the configured connection string
2. **Identifies super admin users** to preserve
3. **Deletes all data** from the following collections:
   - Factories
   - Products
   - Processes
   - Machines
   - Attendance Records
   - Work Entries
4. **Deletes all users** except super admins
5. **Reports final state** of the database
6. **Displays preserved credentials**

## Example Output

```
🗑️  Starting database reset...
👑 Found 1 super admin(s) to preserve:
   - admin@example.com (Super Admin)

🧹 Clearing all data...
   ✅ Deleted 1 Factories
   ✅ Deleted 3 Products
   ✅ Deleted 3 Processes
   ✅ Deleted 3 Machines
   ✅ Deleted 21 Attendance Records
   ✅ Deleted 63 Work Entries
   ✅ Deleted 5 non-super admin users

👑 Preserved 1 super admin(s):
   - admin@example.com (Super Admin)

📊 Final database state:
   users: 1
   factories: 0
   products: 0
   processes: 0
   machines: 0
   attendance: 0
   workEntries: 0

✅ Database reset completed successfully!
🔑 Super admin credentials preserved:
   Email: admin@example.com
   Username: admin@example.com
```

## After Reset

1. **Seed the database** with test data:
   ```bash
   npm run seed
   ```

2. **Start the server**:
   ```bash
   npm run dev
   ```

## Safety Features

- **Confirmation required** in PowerShell script
- **Detailed logging** of what gets deleted
- **Preserves super admin credentials**
- **Reports final database state**
- **Graceful error handling**

## Use Cases

- **Development testing** - Clean slate for testing
- **Data corruption recovery** - Reset when data is corrupted
- **Fresh start** - Remove all test data and start over
- **Production maintenance** - Reset staging/development environments

## Environment Variables

The script uses the same MongoDB connection as the main application:
- `MONGODB_URI` - MongoDB connection string (defaults to `mongodb://localhost:27017/operion`)

## Troubleshooting

### Connection Issues
- Ensure MongoDB is running
- Check connection string in environment variables
- Verify network connectivity

### Permission Issues
- Ensure database user has delete permissions
- Check MongoDB user roles

### Script Fails
- Check console output for specific error messages
- Verify all dependencies are installed (`npm install`)
- Ensure TypeScript compilation works (`npm run build`)

## Security Notes

- **Never run in production** without proper backups
- **Always backup super admin credentials** before running
- **Test in development** environment first
- **Verify preserved data** after reset
