# Manual EC2 Deployment Guide

Since the EC2 instance is too resource-constrained to build TypeScript, we'll build locally and deploy the compiled code.

## Quick Deploy Steps

### Step 1: Build Locally (Windows)

```powershell
cd operion-backend
npm run build
Compress-Archive -Path dist -DestinationPath dist.zip -Force
```

### Step 2: Upload to EC2

**Option A: Using SCP (if you have OpenSSH)**
```powershell
scp -i "path\to\your-key.pem" dist.zip ubuntu@your-ec2-ip:~/operion-backend/
```

**Option B: Using WinSCP (GUI tool)**
1. Download WinSCP: https://winscp.net/
2. Connect to your EC2 instance
3. Navigate to `~/operion-backend/`
4. Upload `dist.zip`

**Option C: Using FileZilla with SFTP**
1. Download FileZilla: https://filezilla-project.org/
2. Use SFTP protocol
3. Convert your .pem key to .ppk if needed
4. Upload `dist.zip`

### Step 3: Extract and Restart on EC2

SSH into EC2 and run:
```bash
cd ~/operion-backend
rm -rf dist
unzip dist.zip
rm dist.zip
pm2 restart operion-backend
pm2 logs operion-backend --lines 20
```

## Alternative: Use the Deployment Script

```powershell
# Run the automated script
.\deploy-dist-to-ec2.ps1 -EC2Host "your-ec2-ip" -KeyFile "path\to\your-key.pem"
```

## EC2 Resource Issue

Your EC2 instance has:
- Memory: 714Mi total (only 97Mi free)
- Swap: 0B (none configured)
- This is insufficient for TypeScript compilation

### Solutions:

1. **Keep building locally** (recommended for now)
2. **Add swap space on EC2** (one-time setup):
   ```bash
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```
3. **Upgrade EC2 instance** to one with more memory (t3.small or larger)

## Verifying Deployment

After deployment, check:
```bash
# Check PM2 status
pm2 status

# Check logs
pm2 logs operion-backend --lines 50

# Check if server is responding
curl http://localhost:3000/health

# Check specific API endpoint
curl http://localhost:3000/api/csrf-token
```

## Troubleshooting

If PM2 won't start:
```bash
# Check for errors in logs
pm2 logs operion-backend --err --lines 100

# Try starting manually to see errors
cd ~/operion-backend
node dist/server.js

# Check if port 3000 is already in use
sudo lsof -i :3000
```

