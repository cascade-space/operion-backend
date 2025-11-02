# 🚀 Deployment Summary - EC2 with Self-Hosted MongoDB

## ✅ What's Been Created

### Automation Scripts (8 files)

| Script | Purpose | Run Time |
|--------|---------|----------|
| `setup-all.sh` | **Complete automated setup** | ~10 min |
| `ec2-setup.sh` | System dependencies | ~5 min |
| `mongodb-setup.sh` | MongoDB installation | ~5 min |
| `deploy-backend.sh` | Application deployment | ~3 min |
| `mongodb-backup.sh` | Database backups | ~1 min |
| `ssl-setup.sh` | HTTPS/SSL setup | ~2 min |
| `monitor-health.sh` | Health monitoring | <1 sec |
| `nginx-config.conf` | Nginx template | - |

### Documentation (4 files)

| Document | Purpose |
|----------|---------|
| `DEPLOYMENT_GUIDE_EC2.md` | Complete step-by-step guide |
| `README.md` | Scripts reference |
| `CHANGELOG.md` | Version history |
| `../DEPLOYMENT_QUICK_START.md` | Quick start checklist |

---

## 🎯 Quick Start (One Command)

```bash
# On EC2 instance
git clone https://github.com/your-username/operion.git
cd operion/Backend
chmod +x deploy/*.sh
sudo ./deploy/setup-all.sh
```

**That's it!** The script will guide you through:
1. ✅ Installing Node.js, PM2, Nginx
2. ✅ Installing MongoDB
3. ✅ Creating database users
4. ✅ Configuring environment
5. ✅ Deploying backend
6. ✅ Setting up Nginx

---

## 📋 Manual Step-by-Step

### 1. Launch EC2 Instance

- **AMI**: Ubuntu 22.04 LTS or Amazon Linux 2023
- **Type**: t2.micro (free tier)
- **Security Group**: Ports 22, 80, 443, 3000
- **Storage**: 20GB

### 2. Connect and Setup

```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
git clone https://github.com/your-username/operion.git
cd operion/Backend
```

### 3. Run Automated Setup

```bash
chmod +x deploy/*.sh
sudo ./deploy/setup-all.sh
```

### 4. Generate JWT Secrets

```bash
# Generate two secrets (run twice)
openssl rand -base64 32
```

### 5. Configure Environment

```bash
nano .env
```

**Required values:**
```env
MONGODB_URI_PROD=mongodb://operion_app:password@localhost:27017/operion_prod?authSource=operion_prod
JWT_SECRET=first-generated-secret
JWT_REFRESH_SECRET=second-generated-secret
CORS_ORIGINS=https://your-app.vercel.app
```

### 6. Deploy Frontend

1. Deploy to Vercel
2. Get Vercel URL
3. Update `CORS_ORIGINS` in `.env`
4. Restart: `pm2 restart operion-backend`

---

## 🔧 Scripts Reference

### Complete Setup
```bash
sudo ./deploy/setup-all.sh
```

### Individual Scripts

```bash
# System setup
sudo ./deploy/ec2-setup.sh

# MongoDB setup
sudo ./deploy/mongodb-setup.sh

# Deploy backend
./deploy/deploy-backend.sh

# Setup SSL (if you have domain)
sudo ./deploy/ssl-setup.sh

# Backup MongoDB
export MONGODB_PASS=password
./deploy/mongodb-backup.sh
```

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] Health endpoint works: `curl http://localhost:3000/health`
- [ ] PM2 shows app running: `pm2 status`
- [ ] MongoDB is running: `sudo systemctl status mongod`
- [ ] Nginx is running: `sudo systemctl status nginx`
- [ ] Frontend connects without CORS errors
- [ ] Login/registration works
- [ ] Backups are configured (cron job)

---

## 🔐 Security Configuration

### MongoDB Security
- ✅ Authentication enabled
- ✅ Bound to localhost only
- ✅ Strong passwords required
- ✅ Separate users (admin + app)

### Application Security
- ✅ JWT secrets 32+ characters
- ✅ CORS restricted to frontend URL
- ✅ Environment variables secure
- ✅ No secrets in code

### Infrastructure Security
- ✅ SSH key authentication
- ✅ Security group restrictions
- ✅ SSL/HTTPS (after setup)
- ✅ Firewall configured

---

## 💾 Backup Strategy

### Automated Daily Backups

```bash
# Setup cron job (runs at 2 AM daily)
crontab -e

# Add:
0 2 * * * cd ~/operion/Backend && export MONGODB_PASS='password' && ./deploy/mongodb-backup.sh >> ~/backup.log 2>&1
```

### Backup Location
- **Path**: `~/backups/mongodb/`
- **Format**: `backup_YYYYMMDD_HHMMSS.tar.gz`
- **Retention**: 7 days (configurable)

### Manual Backup
```bash
export MONGODB_PASS=your-password
./deploy/mongodb-backup.sh
```

### Restore Backup
```bash
# Extract
tar -xzf ~/backups/mongodb/backup_YYYYMMDD_HHMMSS.tar.gz -C /tmp

# Restore
mongorestore --uri="mongodb://operion_app:password@localhost:27017/operion_prod?authSource=operion_prod" \
  /tmp/backup_YYYYMMDD_HHMMSS/operion_prod
```

---

## 📊 Monitoring

### Health Monitoring

Setup automated health checks:
```bash
crontab -e
# Check every 5 minutes
*/5 * * * * ~/operion/Backend/deploy/monitor-health.sh >> ~/health-check.log 2>&1
```

### Log Monitoring

```bash
# Application logs
pm2 logs operion-backend
pm2 logs operion-backend --lines 100

# MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log

# Nginx logs
sudo tail -f /var/log/nginx/operion_access.log
sudo tail -f /var/log/nginx/operion_error.log

# System logs
sudo journalctl -u mongod -f
sudo journalctl -u nginx -f
```

---

## 🔄 Updates and Maintenance

### Update Application

```bash
cd ~/operion/Backend
git pull
npm install
npm run build
pm2 restart operion-backend
```

### Update System Packages

```bash
# Ubuntu
sudo apt update && sudo apt upgrade -y

# Amazon Linux
sudo yum update -y
```

### MongoDB Maintenance

```bash
# Check status
sudo systemctl status mongod

# View logs
sudo tail -f /var/log/mongodb/mongod.log

# Restart
sudo systemctl restart mongod
```

---

## 🐛 Troubleshooting

### Backend Won't Start
```bash
pm2 logs operion-backend
# Check for MongoDB connection errors
# Verify .env file is correct
```

### MongoDB Connection Fails
```bash
# Test connection
mongosh -u operion_app -p password --authenticationDatabase operion_prod

# Check MongoDB status
sudo systemctl status mongod
```

### Health Check Fails
```bash
# Test locally
curl http://localhost:3000/health

# Check PM2
pm2 status
pm2 restart operion-backend
```

### Nginx Issues
```bash
# Test configuration
sudo nginx -t

# Check logs
sudo tail -f /var/log/nginx/operion_error.log

# Restart
sudo systemctl restart nginx
```

---

## 📚 Documentation Files

- **Quick Start**: `../DEPLOYMENT_QUICK_START.md`
- **Complete Guide**: `DEPLOYMENT_GUIDE_EC2.md`
- **Scripts Reference**: `README.md`
- **Backend Docs**: `../DEPLOYMENT.md`
- **Environment Template**: `../env.production.example`

---

## 🎉 Deployment Complete!

Your backend is now running on EC2 with:
- ✅ Self-hosted MongoDB
- ✅ PM2 process management
- ✅ Nginx reverse proxy
- ✅ Automated backups
- ✅ Health monitoring
- ✅ Ready for SSL/HTTPS

**Next Steps:**
1. Deploy frontend to Vercel
2. Update CORS configuration
3. Test end-to-end
4. Setup SSL (if you have domain)
5. Configure custom domain (optional)

---

## 💡 Tips

1. **Start Simple**: Use local storage initially, add S3 later
2. **Monitor Resources**: t2.micro has limited RAM (1GB)
3. **Regular Backups**: Critical for data safety
4. **Update Regularly**: Keep system packages updated
5. **Watch Logs**: Monitor application logs regularly
6. **Test Health**: Verify health endpoint after any changes

---

## 📞 Support Resources

- **Deployment Guide**: `DEPLOYMENT_GUIDE_EC2.md`
- **Quick Start**: `../DEPLOYMENT_QUICK_START.md`
- **Troubleshooting**: See guides above
- **Script Help**: `README.md`

**Ready to deploy? Follow the Quick Start above! 🚀**

