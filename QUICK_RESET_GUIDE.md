# Quick Database Reset Guide

## 🚀 Quick Commands

### Reset Database (keeps super admin)
```bash
npm run reset
```

### Reset + Seed with test data
```bash
npm run reset && npm run seed
```

### Windows PowerShell
```powershell
.\reset-database.ps1
```

### Windows Batch
```cmd
reset-database.bat
```

## 📋 What Gets Reset

| Collection | Action |
|------------|--------|
| Users | ❌ Delete all except super admins |
| Factories | ❌ Delete all |
| Products | ❌ Delete all |
| Processes | ❌ Delete all |
| Machines | ❌ Delete all |
| Attendance | ❌ Delete all |
| Work Entries | ❌ Delete all |

## 🔑 What Gets Preserved

- ✅ Super admin accounts
- ✅ Super admin login credentials
- ✅ Super admin profile information

## 🎯 Common Workflows

### Fresh Development Start
```bash
npm run reset
npm run seed
npm run dev
```

### Clean Test Environment
```bash
npm run reset
npm run seed
# Run your tests
```

### Production Maintenance
```bash
# Backup first!
npm run reset
# Restore from backup if needed
```

## ⚠️ Safety Checklist

- [ ] MongoDB is running
- [ ] You have super admin credentials backed up
- [ ] You're in the correct environment (not production!)
- [ ] All important data is backed up

## 🔧 Troubleshooting

### "Cannot connect to MongoDB"
- Start MongoDB service
- Check connection string
- Verify network connectivity

### "No super admin found"
- Create super admin first: `npm run seed`
- Check user roles in database

### "Permission denied"
- Check MongoDB user permissions
- Ensure database access rights

## 📞 Support

If you encounter issues:
1. Check the console output for error messages
2. Verify MongoDB is running
3. Ensure all dependencies are installed
4. Check the full documentation in `DATABASE_RESET_README.md`
