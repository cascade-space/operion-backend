# Backend Deployment Guide

This guide provides step-by-step instructions for deploying the Operion backend to AWS (Elastic Beanstalk or EC2) and configuring it to work with the Vercel-deployed frontend.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables Checklist](#environment-variables-checklist)
3. [AWS Elastic Beanstalk Deployment](#aws-elastic-beanstalk-deployment)
4. [AWS EC2 Deployment](#aws-ec2-deployment)
5. [MongoDB Atlas Configuration](#mongodb-atlas-configuration)
6. [Security Configuration](#security-configuration)
7. [Verification & Testing](#verification--testing)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

- AWS account with appropriate permissions
- MongoDB Atlas account (Free Tier available)
- Domain name registered (optional, can use default AWS URLs)
- AWS CLI configured (optional, for automation)
- Strong JWT secrets generated (32+ characters each)

## Environment Variables Checklist

### git pull
Required for Production

Copy `env.production.example` to `.env.production` and configure these variables:

#### Server Configuration
- [ ] `NODE_ENV=production`
- [ ] `PORT=3000` (or `8080` for Elastic Beanstalk - check your platform)
- [ ] `WS_PORT=3001`
- [ ] `LOG_LEVEL=info`

#### Database Configuration
- [ ] `MONGODB_URI_PROD=mongodb+srv://username:password@cluster.mongodb.net/operion_prod?retryWrites=true&w=majority`
  - Get from MongoDB Atlas → Connect → Connect your application

#### JWT Configuration
- [ ] `JWT_SECRET=<32+ character secret>` 
  - Generate: `openssl rand -base64 32`
- [ ] `JWT_REFRESH_SECRET=<different 32+ character secret>`
  - Generate: `openssl rand -base64 32`
- [ ] `JWT_EXPIRES_IN=15m`
- [ ] `JWT_REFRESH_EXPIRES_IN=7d`

#### CORS Configuration
- [ ] `CORS_ORIGINS=https://your-app.vercel.app,https://yourdomain.com`
  - **CRITICAL**: Must include your Vercel frontend URL
  - Format: Comma-separated, no spaces, use HTTPS
  - Example: `https://operion-app.vercel.app,https://app.yourdomain.com`

#### Storage Configuration
- [ ] `STORAGE_TYPE=s3` (or `local` for testing)
- [ ] `AWS_S3_BUCKET=operion-production-files`
- [ ] `AWS_S3_REGION=us-east-1`
- [ ] `AWS_ACCESS_KEY_ID=<your-access-key>`
- [ ] `AWS_SECRET_ACCESS_KEY=<your-secret-key>`
  - Or use IAM roles (recommended for EC2/Elastic Beanstalk)

#### Optional but Recommended
- [ ] `REDIS_URL=redis://your-redis-instance.cache.amazonaws.com:6379`
- [ ] `REDIS_REQUIRED=true` (if Redis is critical)
- [ ] `SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id`
- [ ] `SMTP_HOST=smtp.sendgrid.net`
- [ ] `SMTP_PORT=587`
- [ ] `SMTP_USER=apikey`
- [ ] `SMTP_PASS=<your-sendgrid-api-key>`

## AWS Elastic Beanstalk Deployment

Elastic Beanstalk is recommended for beginners - it manages servers, load balancing, and auto-scaling automatically.

### Step 1: Prepare Application

1. **Build the application:**
   ```bash
   cd Backend
   npm install
   npm run build
   ```

2. **Verify build:**
   ```bash
   # Check that dist/server.js exists
   ls -la dist/server.js
   ```

3. **Create deployment package:**
   ```bash
   # Create a zip file (exclude node_modules, but include package.json)
   zip -r deploy.zip . -x "node_modules/*" -x ".git/*" -x "*.log" -x "uploads/*"
   ```

### Step 2: Create Elastic Beanstalk Application

1. **Via AWS Console:**
   - Go to Elastic Beanstalk → Create Application
   - Application name: `operion-backend`
   - Platform: Node.js
   - Platform branch: Node.js 18 or 20
   - Application code: Upload your `deploy.zip`

2. **Via AWS CLI:**
   ```bash
   aws elasticbeanstalk create-application \
     --application-name operion-backend \
     --description "Operion Factory Management Backend"
   ```

### Step 3: Configure Environment Variables

1. Go to Elastic Beanstalk → Your Environment → Configuration → Software
2. Scroll to "Environment properties"
3. Add all environment variables from the checklist above
4. Click "Apply"

**Important Variables:**
- Set `PORT=8080` (Elastic Beanstalk uses port 8080 by default)
- Set `CORS_ORIGINS` with your Vercel frontend URL
- Set `MONGODB_URI_PROD` with your Atlas connection string

### Step 4: Configure Security Groups

1. Go to EC2 → Security Groups → Find your Elastic Beanstalk security group
2. Edit inbound rules:
   - Allow HTTP (port 80) from `0.0.0.0/0`
   - Allow HTTPS (port 443) from `0.0.0.0/0`
3. Edit outbound rules:
   - Allow all traffic (or restrict to MongoDB Atlas IPs if known)

### Step 5: Deploy and Verify

1. Deploy your application
2. Wait for health check to pass (green status)
3. Test health endpoint:
   ```bash
   curl https://your-app.elasticbeanstalk.com/health
   ```
4. Check logs if issues occur:
   - Elastic Beanstalk → Logs → Request Logs → Last 100 Lines

## AWS EC2 Deployment

For EC2, you'll manage the server manually. Use this if you need more control or want to use the free tier t2.micro instance.

### Step 1: Launch EC2 Instance

1. **Launch Instance:**
   - AMI: Amazon Linux 2023 or Ubuntu 22.04 LTS
   - Instance type: t2.micro (free tier) or t3.small
   - Security group: Allow SSH (22), HTTP (80), HTTPS (443), Custom TCP (3000)
   - Key pair: Create or select existing

2. **Connect to Instance:**
   ```bash
   ssh -i your-key.pem ec2-user@your-ec2-ip
   # Or for Ubuntu:
   ssh -i your-key.pem ubuntu@your-ec2-ip
   ```

### Step 2: Install Dependencies

**For Amazon Linux 2023:**
```bash
sudo yum update -y
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
npm install -g pm2
```

**For Ubuntu:**
```bash
sudo apt update
sudo apt install -y nodejs npm
sudo npm install -g pm2
sudo npm install -g n
sudo n stable
```

### Step 3: Clone and Setup Application

```bash
# Install Git if not installed
sudo yum install -y git  # Amazon Linux
# sudo apt install -y git  # Ubuntu

# Clone your repository
git clone https://github.com/your-username/operion.git
cd operion/Backend

# Install dependencies
npm install

# Build application
npm run build
```

### Step 4: Configure Environment Variables

1. **Create `.env` file:**
   ```bash
   cp env.production.example .env
   nano .env  # Edit with your values
   ```

2. **Set all required variables** from the checklist above
3. **Important:** Set `PORT=3000` (not 8080 for EC2)

### Step 5: Install and Configure PM2

```bash
# Start application with PM2
npm run pm2:start

# Save PM2 configuration
pm2 save

# Configure PM2 to start on boot
pm2 startup
# Follow the command it outputs
```

### Step 6: Configure Nginx (Optional but Recommended)

If you want a reverse proxy and HTTPS:

```bash
# Install Nginx
sudo yum install -y nginx  # Amazon Linux
# sudo apt install -y nginx  # Ubuntu

# Create Nginx config
sudo nano /etc/nginx/conf.d/operion.conf
```

Add:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Restart Nginx:
```bash
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### Step 7: Verify Deployment

```bash
# Check PM2 status
pm2 status

# Check logs
npm run pm2:logs

# Test health endpoint
curl http://localhost:3000/health
# Or if using Nginx:
curl http://your-domain.com/health
```

## MongoDB Atlas Configuration

### Step 1: Create MongoDB Atlas Cluster

1. Go to MongoDB Atlas → Create Cluster
2. Choose Free Tier (M0)
3. Select region closest to your AWS region
4. Create cluster (takes 3-5 minutes)

### Step 2: Configure Network Access

1. Go to Network Access → Add IP Address
2. **For Elastic Beanstalk:**
   - Add `0.0.0.0/0` temporarily for testing
   - Or find your Elastic Beanstalk environment IP and add it
3. **For EC2:**
   - Add your EC2 instance public IP
   - Or add `0.0.0.0/0` (less secure, but easier for testing)

**Security Note:** For production, restrict to specific IPs:
- Your AWS security group IPs
- Your EC2 instance IP
- Your development IP (for admin access)

### Step 3: Create Database User

1. Go to Database Access → Add New Database User
2. Choose "Password" authentication
3. Set username and strong password
4. Grant "Atlas Admin" role (or custom role with read/write permissions)
5. Save user

### Step 4: Get Connection String

1. Go to Database → Connect → Connect your application
2. Choose Node.js driver version 5.5 or later
3. Copy connection string
4. Replace `<password>` with your database user password
5. Replace `<database>` with `operion_prod` (or your database name)
6. Use this as `MONGODB_URI_PROD` in environment variables

Example:
```
mongodb+srv://username:password@cluster.mongodb.net/operion_prod?retryWrites=true&w=majority
```

## Security Configuration

### AWS Security Groups

#### Elastic Beanstalk Security Group:
- **Inbound:**
  - HTTP (80) from `0.0.0.0/0` (for health checks)
  - HTTPS (443) from `0.0.0.0/0` (for API access)
- **Outbound:**
  - All traffic (for MongoDB Atlas, S3, etc.)

#### EC2 Security Group:
- **Inbound:**
  - SSH (22) from your IP only (restrict for security)
  - HTTP (80) from `0.0.0.0/0`
  - HTTPS (443) from `0.0.0.0/0`
  - Custom TCP (3000) from your load balancer or `0.0.0.0/0` for testing
- **Outbound:**
  - All traffic (or restrict to MongoDB Atlas, S3 IPs)

### MongoDB Atlas Security

1. **Network Access:**
   - Restrict to specific IPs when possible
   - Use `0.0.0.0/0` only for testing

2. **Database Users:**
   - Use strong passwords
   - Grant minimum required permissions
   - Create separate users for different applications

3. **Encryption:**
   - MongoDB Atlas encrypts data at rest by default
   - Use TLS/SSL for connections (enabled by default)

### Application Security

1. **JWT Secrets:**
   - Must be 32+ characters
   - Generate using: `openssl rand -base64 32`
   - Store in AWS Secrets Manager (recommended) or environment variables

2. **CORS:**
   - Always include your frontend URL in `CORS_ORIGINS`
   - Use HTTPS in production
   - Don't use wildcards (`*`) in production

3. **Environment Variables:**
   - Never commit `.env` files
   - Use AWS Secrets Manager or Parameter Store for sensitive values
   - Rotate secrets regularly

## Verification & Testing

### 1. Health Check

```bash
curl https://your-backend-url.com/health
```

Expected response:
```json
{
  "success": true,
  "message": "Server is healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "services": {
    "mongodb": {
      "status": "connected",
      "latency": "5ms"
    },
    "redis": {
      "status": "connected",
      "latency": "2ms"
    }
  }
}
```

### 2. Test API Endpoint

```bash
# Test without authentication (should return 401 or public endpoint)
curl https://your-backend-url.com/api/v1/factories

# Test with authentication
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-backend-url.com/api/v1/factories
```

### 3. Test CORS

Open browser console on your Vercel frontend and check:
- No CORS errors in console
- API requests succeed
- WebSocket connections work (if used)

### 4. Check Logs

**Elastic Beanstalk:**
- Go to Elastic Beanstalk → Logs → Request Logs
- Look for errors or warnings

**EC2 with PM2:**
```bash
npm run pm2:logs
# Or
pm2 logs operion-backend
```

### 5. Verify Environment Variables

Check that all required variables are set:
```bash
# On EC2
pm2 env 0  # Shows environment variables for PM2 process
```

## Troubleshooting

### Application Won't Start

1. **Check logs:**
   - Elastic Beanstalk: View logs in console
   - EC2: `pm2 logs` or `npm run pm2:logs`

2. **Common issues:**
   - Missing environment variables (check startup logs)
   - MongoDB connection failed (check network access and connection string)
   - Port conflict (ensure PORT matches platform: 8080 for EB, 3000 for EC2)
   - JWT secrets too short or weak (must be 32+ characters)

### CORS Errors

1. **Check CORS_ORIGINS:**
   ```bash
   # Verify environment variable is set
   echo $CORS_ORIGINS
   ```

2. **Common issues:**
   - Missing Vercel URL in CORS_ORIGINS
   - Using HTTP instead of HTTPS
   - Extra spaces in comma-separated list
   - Trailing slashes in URLs

3. **Fix:**
   - Update CORS_ORIGINS to include: `https://your-app.vercel.app`
   - Restart application

### Database Connection Failed

1. **Check MongoDB Atlas:**
   - Network Access: Is your IP/security group allowed?
   - Database User: Are credentials correct?
   - Connection String: Is it properly formatted?

2. **Test connection:**
   ```bash
   # Test from EC2 or locally
   mongosh "mongodb+srv://username:password@cluster.mongodb.net/operion_prod"
   ```

3. **Check logs:**
   - Look for MongoDB connection errors in application logs

### Health Check Failing

1. **Check application is running:**
   - EC2: `pm2 status`
   - Elastic Beanstalk: Check environment health

2. **Check port:**
   - Elastic Beanstalk uses port 8080
   - EC2 uses port 3000 (or whatever you configured)

3. **Check security groups:**
   - Allow inbound traffic on the correct port

### High Memory/CPU Usage

1. **Optimize PM2 (EC2):**
   - Reduce instances if using cluster mode
   - Increase `max_memory_restart` in `ecosystem.config.js`

2. **Scale Elastic Beanstalk:**
   - Increase instance size or enable auto-scaling
   - Add more instances

3. **Check for memory leaks:**
   - Review application logs
   - Use PM2 monitoring: `pm2 monit`

## Next Steps

After successful deployment:

1. **Set up monitoring:**
   - Configure Sentry for error tracking
   - Set up CloudWatch alarms

2. **Configure backups:**
   - Set up automated MongoDB backups
   - Configure S3 backup script

3. **Set up CI/CD:**
   - Configure GitHub Actions for automated deployment
   - Set up staging environment

4. **Add custom domain:**
   - Configure Route 53 or your DNS provider
   - Set up SSL certificate with AWS Certificate Manager

## Additional Resources

- [Elastic Beanstalk Node.js Platform](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create_deploy_nodejs.html)
- [EC2 User Guide](https://docs.aws.amazon.com/ec2/)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)

