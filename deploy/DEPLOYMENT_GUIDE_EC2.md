# Complete EC2 Deployment Guide with Self-Hosted MongoDB

This guide walks you through deploying Operion backend on AWS EC2 free tier with self-hosted MongoDB.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Detailed Setup](#detailed-setup)
4. [MongoDB Setup](#mongodb-setup)
5. [Backend Deployment](#backend-deployment)
6. [SSL/HTTPS Setup](#sslhttps-setup)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- AWS account with EC2 free tier access
- Domain name (optional, for SSL)
- Basic knowledge of Linux commands
- SSH access to EC2 instance

---

## Quick Start

### 1. Launch EC2 Instance

1. Go to AWS Console → EC2 → Launch Instance
2. Choose: **Ubuntu 22.04 LTS** or **Amazon Linux 2023**
3. Instance type: **t2.micro** (free tier)
4. Create/select key pair
5. Security Group: Allow ports 22, 80, 443, 3000
6. Launch instance

### 2. Connect to Instance

```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
# Or for Amazon Linux:
ssh -i your-key.pem ec2-user@your-ec2-ip
```

### 3. Run Setup Scripts

```bash
# Clone repository
git clone https://github.com/your-username/operion.git
cd operion/Backend

# Make scripts executable
chmod +x deploy/*.sh

# 1. Setup system (Node.js, PM2, Nginx)
sudo ./deploy/ec2-setup.sh

# 2. Install MongoDB
sudo ./deploy/mongodb-setup.sh

# 3. Configure environment
cp env.production.example .env
nano .env  # Edit with your values

# 4. Deploy backend
./deploy/deploy-backend.sh

# 5. Setup Nginx
sudo cp deploy/nginx-config.conf /etc/nginx/sites-available/operion
sudo nano /etc/nginx/sites-available/operion  # Edit server_name
sudo ln -s /etc/nginx/sites-available/operion /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Detailed Setup

### Step 1: EC2 Instance Setup

#### Security Group Configuration

Create security group with these rules:

| Type | Protocol | Port | Source |
|------|----------|------|--------|
| SSH | TCP | 22 | Your IP |
| HTTP | TCP | 80 | 0.0.0.0/0 |
| HTTPS | TCP | 443 | 0.0.0.0/0 |
| Custom TCP | TCP | 3000 | 0.0.0.0/0 (or your IP) |

#### Launch Instance

1. **AMI**: Ubuntu Server 22.04 LTS or Amazon Linux 2023
2. **Instance Type**: t2.micro
3. **Storage**: 20GB gp3
4. **Security Group**: Use the one created above
5. **Key Pair**: Create new or select existing

#### Connect to Instance

```bash
# Ubuntu
ssh -i your-key.pem ubuntu@your-ec2-public-ip

# Amazon Linux
ssh -i your-key.pem ec2-user@your-ec2-public-ip
```

---

## MongoDB Setup

### Option A: Using Setup Script (Recommended)

```bash
cd ~/operion/Backend
sudo ./deploy/mongodb-setup.sh
```

The script will:
- Install MongoDB
- Create admin and application users
- Enable authentication
- Generate connection string

### Option B: Manual Setup

#### Install MongoDB

**Ubuntu:**
```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

**Amazon Linux:**
```bash
sudo tee /etc/yum.repos.d/mongodb-org-7.0.repo > /dev/null <<EOF
[mongodb-org-7.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/amazon/2023/mongodb-org/7.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-7.0.asc
EOF

sudo yum install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

#### Create Users

```bash
mongosh

# Create admin user
use admin
db.createUser({
  user: "admin",
  pwd: "your-admin-password",
  roles: [ { role: "userAdminAnyDatabase", db: "admin" }, "readWriteAnyDatabase" ]
})

# Create application user
use operion_prod
db.createUser({
  user: "operion_app",
  pwd: "your-app-password",
  roles: [ { role: "readWrite", db: "operion_prod" } ]
})

exit
```

#### Enable Authentication

```bash
sudo nano /etc/mongod.conf
```

Add/modify:
```yaml
security:
  authorization: enabled

net:
  bindIp: 127.0.0.1
  port: 27017
```

Restart MongoDB:
```bash
sudo systemctl restart mongod
```

#### Test Connection

```bash
mongosh -u operion_app -p your-password --authenticationDatabase operion_prod
```

---

## Backend Deployment

### 1. Clone Repository

```bash
git clone https://github.com/your-username/operion.git
cd operion/Backend
```

### 2. Configure Environment

```bash
cp env.production.example .env
nano .env
```

**Required Variables:**

```env
NODE_ENV=production
PORT=3000
WS_PORT=3001
LOG_LEVEL=info

# MongoDB Connection (self-hosted)
MONGODB_URI_PROD=mongodb://operion_app:your-password@localhost:27017/operion_prod?authSource=operion_prod

# JWT Secrets (generate with: openssl rand -base64 32)
JWT_SECRET=your-generated-secret-32-chars-min
JWT_REFRESH_SECRET=different-generated-secret-32-chars-min
JWT_EXPIRES_IN=30d
JWT_REFRESH_EXPIRES_IN=365d

# CORS (your Vercel frontend URL)
CORS_ORIGINS=https://your-app.vercel.app

# Storage
STORAGE_TYPE=local
```

### 3. Generate JWT Secrets

```bash
# Generate two different secrets
openssl rand -base64 32
openssl rand -base64 32
```

### 4. Deploy Application

```bash
# Install dependencies
npm install

# Build application
npm run build

# Start with PM2
npm run pm2:start

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the command it outputs
```

### 5. Verify Deployment

```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs operion-backend

# Test health endpoint
curl http://localhost:3000/health
```

---

## SSL/HTTPS Setup

### Prerequisites

- Domain name pointing to your EC2 instance
- Port 80 and 443 open in security group

### Install SSL Certificate

```bash
sudo ./deploy/ssl-setup.sh
```

Or manually:

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx  # Ubuntu
# OR
sudo dnf install certbot python3-certbot-nginx  # Amazon Linux

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

---

## Monitoring & Maintenance

### MongoDB Backups

#### Setup Automated Backups

```bash
# Edit backup script with your MongoDB password
nano ~/operion/Backend/deploy/mongodb-backup.sh

# Make executable
chmod +x ~/operion/Backend/deploy/mongodb-backup.sh

# Test backup
export MONGODB_DB_NAME=operion_prod
export MONGODB_USER=operion_app
export MONGODB_PASS=your-password
~/operion/Backend/deploy/mongodb-backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add this line:
0 2 * * * cd ~/operion/Backend && export MONGODB_PASS='your-password' && ./deploy/mongodb-backup.sh >> /var/log/mongodb-backup.log 2>&1
```

#### Restore from Backup

```bash
# Extract backup
tar -xzf ~/backups/mongodb/backup_YYYYMMDD_HHMMSS.tar.gz -C /tmp

# Restore
mongorestore --uri="mongodb://operion_app:password@localhost:27017/operion_prod?authSource=operion_prod" /tmp/backup_YYYYMMDD_HHMMSS/operion_prod
```

### Health Monitoring

```bash
# Setup health check cron job
crontab -e
# Add: Run every 5 minutes
*/5 * * * * ~/operion/Backend/deploy/monitor-health.sh
```

### Log Management

```bash
# View application logs
pm2 logs operion-backend

# View MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log

# View Nginx logs
sudo tail -f /var/log/nginx/operion_access.log
sudo tail -f /var/log/nginx/operion_error.log

# Rotate logs (PM2)
pm2 flush
```

### Updates

```bash
cd ~/operion/Backend

# Pull latest changes
git pull

# Install dependencies
npm install

# Rebuild
npm run build

# Restart application
pm2 restart operion-backend
```

---

## Troubleshooting

### MongoDB Issues

**MongoDB won't start:**
```bash
# Check status
sudo systemctl status mongod

# Check logs
sudo tail -f /var/log/mongodb/mongod.log

# Check disk space
df -h

# Check permissions
sudo chown -R mongod:mongod /var/lib/mongodb
```

**Connection refused:**
```bash
# Verify MongoDB is running
sudo systemctl status mongod

# Check bind IP in config
sudo cat /etc/mongod.conf | grep bindIp

# Test connection
mongosh -u operion_app -p password --authenticationDatabase operion_prod
```

### Backend Issues

**Application won't start:**
```bash
# Check PM2 logs
pm2 logs operion-backend --lines 50

# Check environment variables
pm2 env 0

# Test MongoDB connection manually
node -e "require('mongoose').connect('your-connection-string').then(() => console.log('OK')).catch(e => console.error(e))"
```

**Port already in use:**
```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>
```

**Health check fails:**
```bash
# Check if app is running
pm2 status

# Test locally
curl http://localhost:3000/health

# Check Nginx config
sudo nginx -t

# Check Nginx logs
sudo tail -f /var/log/nginx/operion_error.log
```

### Nginx Issues

**502 Bad Gateway:**
- Check backend is running: `pm2 status`
- Check backend port: `curl http://localhost:3000/health`
- Check Nginx config: `sudo nginx -t`

**SSL Certificate Issues:**
```bash
# Check certificate
sudo certbot certificates

# Renew certificate
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run
```

---

## Security Checklist

- [ ] MongoDB authentication enabled
- [ ] MongoDB only accessible from localhost
- [ ] Strong passwords for MongoDB users
- [ ] JWT secrets are 32+ characters
- [ ] CORS configured with specific frontend URL
- [ ] SSH key authentication (disable password)
- [ ] Security group restricts SSH to your IP
- [ ] SSL/HTTPS enabled
- [ ] Regular backups configured
- [ ] Firewall configured (UFW or Security Groups)
- [ ] Regular system updates: `sudo apt update && sudo apt upgrade`

---

## Cost Optimization (Free Tier)

1. **Use t2.micro instance** (750 hours/month free)
2. **Use gp3 storage** (30GB free tier)
3. **Enable CloudWatch basic monitoring** (free tier)
4. **Use local storage** instead of S3 initially
5. **Skip Redis** initially (optional feature)
6. **Single instance setup** (backend + MongoDB together)

---

## Next Steps

1. ✅ Deploy backend to EC2
2. ✅ Setup MongoDB
3. ✅ Configure environment variables
4. ✅ Deploy frontend to Vercel
5. ✅ Update CORS with Vercel URL
6. ✅ Setup SSL/HTTPS
7. ✅ Configure backups
8. ✅ Setup monitoring

---

## Support

For issues or questions:
- Check logs: `pm2 logs` and `sudo journalctl -u mongod`
- Review security group settings
- Verify environment variables
- Test MongoDB connection manually

