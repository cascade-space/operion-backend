# EC2 Deployment Scripts

Complete deployment automation for Operion backend on AWS EC2 with self-hosted MongoDB.

## Scripts Overview

| Script | Purpose | Run As |
|--------|---------|--------|
| `ec2-setup.sh` | Install Node.js, PM2, Nginx | sudo |
| `mongodb-setup.sh` | Install and configure MongoDB | sudo |
| `mongodb-backup.sh` | Backup MongoDB database | user |
| `deploy-backend.sh` | Deploy backend application | user |
| `ssl-setup.sh` | Setup SSL/HTTPS with Let's Encrypt | sudo |
| `monitor-health.sh` | Health check monitoring | user |
| `nginx-config.conf` | Nginx configuration template | - |

## Quick Start

```bash
# 1. Clone repository on EC2
git clone https://github.com/your-username/operion.git
cd operion/Backend

# 2. Make scripts executable
chmod +x deploy/*.sh

# 3. Run setup scripts (in order)
sudo ./deploy/ec2-setup.sh          # Install dependencies
sudo ./deploy/mongodb-setup.sh      # Install MongoDB
./deploy/deploy-backend.sh          # Deploy application

# 4. Configure Nginx
sudo cp deploy/nginx-config.conf /etc/nginx/sites-available/operion
sudo nano /etc/nginx/sites-available/operion  # Edit server_name
sudo ln -s /etc/nginx/sites-available/operion /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 5. Setup SSL (if you have a domain)
sudo ./deploy/ssl-setup.sh
```

## Detailed Usage

### 1. System Setup (`ec2-setup.sh`)

Installs:
- Node.js 18 (LTS)
- PM2 (process manager)
- Git
- Nginx (reverse proxy)

```bash
sudo ./deploy/ec2-setup.sh
```

### 2. MongoDB Setup (`mongodb-setup.sh`)

Installs MongoDB and creates:
- Admin user
- Application database user
- Enables authentication

**Interactive prompts:**
- MongoDB admin password
- Application password
- Database name (default: operion_prod)

**Output:**
- MongoDB connection string (save this!)

```bash
sudo ./deploy/mongodb-setup.sh
```

**Connection string format:**
```
mongodb://operion_app:password@localhost:27017/operion_prod?authSource=operion_prod
```

### 3. Backend Deployment (`deploy-backend.sh`)

Deploys the backend application:
- Checks for .env file
- Validates required environment variables
- Installs dependencies
- Builds application
- Starts with PM2

**Prerequisites:**
- `.env` file must exist with all required variables
- MongoDB must be running and accessible

```bash
# Ensure .env is configured
cp env.production.example .env
nano .env

# Deploy
./deploy/deploy-backend.sh
```

### 4. MongoDB Backup (`mongodb-backup.sh`)

Creates compressed backups of MongoDB database.

**Environment variables (optional):**
```bash
export MONGODB_DB_NAME=operion_prod
export MONGODB_USER=operion_app
export MONGODB_PASS=your-password
```

**Usage:**
```bash
# One-time backup
export MONGODB_PASS=your-password
./deploy/mongodb-backup.sh

# Setup automated daily backups (2 AM)
crontab -e
# Add:
0 2 * * * cd ~/operion/Backend && export MONGODB_PASS='your-password' && ./deploy/mongodb-backup.sh >> ~/backup.log 2>&1
```

**Backup location:** `~/backups/mongodb/`

**Retention:** 7 days (configurable in script)

### 5. SSL Setup (`ssl-setup.sh`)

Sets up HTTPS using Let's Encrypt.

**Prerequisites:**
- Domain name pointing to EC2 instance
- Ports 80 and 443 open in security group

```bash
sudo ./deploy/ssl-setup.sh
```

**What it does:**
- Installs Certbot
- Obtains SSL certificate
- Configures Nginx for HTTPS
- Sets up auto-renewal

### 6. Health Monitoring (`monitor-health.sh`)

Monitors backend health and auto-restarts if needed.

**Setup cron job:**
```bash
crontab -e
# Check every 5 minutes
*/5 * * * * ~/operion/Backend/deploy/monitor-health.sh >> ~/health-check.log 2>&1
```

**Configuration:**
- `HEALTH_URL`: Backend health endpoint (default: http://localhost:3000/health)
- `LOG_FILE`: Log file location
- `ALERT_EMAIL`: Email for alerts (requires mail setup)

## Environment Variables

Required in `.env` file:

```env
NODE_ENV=production
PORT=3000
WS_PORT=3001
LOG_LEVEL=info

# MongoDB (from mongodb-setup.sh output)
MONGODB_URI_PROD=mongodb://operion_app:password@localhost:27017/operion_prod?authSource=operion_prod

# JWT Secrets (generate: openssl rand -base64 32)
JWT_SECRET=your-secret-32-chars-minimum
JWT_REFRESH_SECRET=different-secret-32-chars-minimum

# CORS (your Vercel frontend URL)
CORS_ORIGINS=https://your-app.vercel.app

# Storage
STORAGE_TYPE=local
```

## Common Tasks

### Restart Application
```bash
pm2 restart operion-backend
```

### View Logs
```bash
pm2 logs operion-backend
pm2 logs operion-backend --lines 100
```

### Check Status
```bash
pm2 status
pm2 monit
```

### Update Application
```bash
cd ~/operion/Backend
git pull
npm install
npm run build
pm2 restart operion-backend
```

### Restore MongoDB Backup
```bash
# Extract backup
tar -xzf ~/backups/mongodb/backup_YYYYMMDD_HHMMSS.tar.gz -C /tmp

# Restore
mongorestore --uri="mongodb://operion_app:password@localhost:27017/operion_prod?authSource=operion_prod" \
  /tmp/backup_YYYYMMDD_HHMMSS/operion_prod
```

## Troubleshooting

### Scripts fail with "Permission denied"
```bash
chmod +x deploy/*.sh
```

### MongoDB setup fails
```bash
# Check MongoDB status
sudo systemctl status mongod

# Check logs
sudo tail -f /var/log/mongodb/mongod.log
```

### Deployment fails
```bash
# Check .env file exists and is configured
cat .env | grep -E "MONGODB_URI_PROD|JWT_SECRET"

# Check build output
npm run build

# Check PM2 logs
pm2 logs operion-backend
```

### Health check fails
```bash
# Test manually
curl http://localhost:3000/health

# Check PM2 status
pm2 status

# Restart if needed
pm2 restart operion-backend
```

## Security Notes

1. **MongoDB passwords**: Use strong passwords (16+ characters)
2. **JWT secrets**: Must be 32+ characters, use `openssl rand -base64 32`
3. **SSH access**: Restrict to your IP in security group
4. **MongoDB**: Bound to localhost only (127.0.0.1)
5. **Environment files**: Never commit .env to git
6. **Backups**: Store in secure location, encrypt if containing sensitive data

## Cost Optimization

- **Free tier**: Use t2.micro instance
- **Storage**: 20GB is sufficient for free tier
- **MongoDB**: Runs on same instance (saves cost)
- **Backups**: Store locally initially, move to S3 later if needed

## Next Steps

After deployment:
1. Deploy frontend to Vercel
2. Update `CORS_ORIGINS` with Vercel URL
3. Test end-to-end functionality
4. Setup monitoring and alerts
5. Configure automated backups
6. Setup SSL/HTTPS (if you have domain)

## Support

For detailed instructions, see:
- `DEPLOYMENT_GUIDE_EC2.md` - Complete deployment guide
- `../DEPLOYMENT.md` - Backend deployment documentation
- `../env.production.example` - Environment variables template

