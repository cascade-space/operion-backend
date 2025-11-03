# Quick HTTPS Setup Guide - Fix Mixed Content Errors

This guide helps you set up HTTPS for your backend API to fix the "Mixed Content" errors when your frontend (HTTPS) tries to access the backend (HTTP).

## Problem

When your frontend is served over HTTPS (`https://www.cascade-erp.in`) but your backend API is HTTP (`http://3.107.223.34:3000`), browsers block the requests due to Mixed Content policy.

**Error you'll see:**
```
Mixed Content: The page at 'https://www.cascade-erp.in/register-factory' was loaded over HTTPS, 
but requested an insecure resource 'http://3.107.223.34:3000/api/factories/register'. 
This request has been blocked; the content must be served over HTTPS.
```

## Solution: Set Up HTTPS for Backend API

### Prerequisites

1. ✅ EC2 instance running your backend (IP: `3.107.223.34`)
2. ✅ Domain name you control (e.g., `cascade-erp.in`)
3. ✅ Nginx installed and configured
4. ✅ Backend running on port 3000
5. ✅ Ports 80 and 443 open in security group

### Step-by-Step Setup

#### 1. Create DNS A Record

Create a subdomain for your API (recommended: `api.yourdomain.com`):

1. Go to your domain DNS provider (Route 53, Cloudflare, etc.)
2. Add an **A record**:
   - **Name**: `api` (or `backend`, `api-server`, etc.)
   - **Type**: A
   - **Value**: `3.107.223.34` (your EC2 instance IP)
   - **TTL**: 300 (or default)

**Example:**
- Domain: `cascade-erp.in`
- API Subdomain: `api.cascade-erp.in` → `3.107.223.34`

#### 2. Verify DNS Propagation

Wait 5-10 minutes for DNS to propagate, then verify:

```bash
# Check if DNS is working
dig api.cascade-erp.in +short
# Should return: 3.107.223.34

# Or use nslookup
nslookup api.cascade-erp.in
```

#### 3. SSH to Your EC2 Instance

```bash
ssh -i your-key.pem ubuntu@3.107.223.34
# Or for Amazon Linux:
ssh -i your-key.pem ec2-user@3.107.223.34
```

#### 4. Ensure Nginx is Configured

If you haven't set up Nginx yet:

```bash
# Install Nginx (if not installed)
sudo apt install nginx  # Ubuntu
# OR
sudo yum install nginx  # Amazon Linux

# Copy the configuration
cd ~/operion/Backend
sudo cp deploy/nginx-config.conf /etc/nginx/conf.d/operion.conf

# Edit to set your domain (replace your-domain.com with api.cascade-erp.in)
sudo nano /etc/nginx/conf.d/operion.conf

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

#### 5. Run SSL Setup Script

```bash
cd ~/operion/Backend/deploy
chmod +x ssl-setup.sh
sudo ./ssl-setup.sh
```

The script will:
- ✅ Install Certbot (Let's Encrypt client)
- ✅ Verify DNS configuration
- ✅ Obtain SSL certificate automatically
- ✅ Configure Nginx for HTTPS
- ✅ Set up auto-renewal
- ✅ Test the certificate

**When prompted:**
- Enter your API domain: `api.cascade-erp.in`
- Enter email (optional): Your email for certificate expiration notifications

#### 6. Verify HTTPS is Working

```bash
# Test from server
curl https://api.cascade-erp.in/health

# Test from your local machine
curl https://api.cascade-erp.in/health
```

You should get a JSON response with server health info.

#### 7. Update Frontend Configuration

Update your frontend to use the HTTPS API URL:

**Before:**
```
API_URL = http://3.107.223.34:3000
```

**After:**
```
API_URL = https://api.cascade-erp.in
```

**Locations to update:**
- Environment variables (`.env` or Vercel environment variables)
- API client configuration
- Any hardcoded API URLs

#### 8. Update Backend CORS Configuration

Make sure your backend allows requests from your frontend domain:

```bash
# Edit .env file on EC2
cd ~/operion/Backend
nano .env
```

Update `CORS_ORIGINS`:
```env
CORS_ORIGINS=https://www.cascade-erp.in,https://cascade-erp.in
```

Restart backend:
```bash
pm2 restart operion-backend
```

#### 9. Test Everything

1. **Test API endpoint:**
   ```bash
   curl https://api.cascade-erp.in/health
   ```

2. **Test from frontend:**
   - Open browser DevTools (F12)
   - Go to Network tab
   - Try to register a factory
   - Verify requests go to `https://api.cascade-erp.in`
   - Check that there are no Mixed Content errors

### Troubleshooting

#### Certificate Installation Fails

**Error: "Failed to verify domain"**
- Check DNS is pointing to correct IP: `dig api.cascade-erp.in`
- Ensure port 80 is open in security group
- Wait for DNS propagation (can take up to 24 hours, usually 5-10 minutes)

**Error: "Rate limit exceeded"**
- Let's Encrypt has rate limits (5 certificates per domain per week)
- Wait 1 hour and try again
- Or use staging environment: `certbot --nginx --staging -d api.cascade-erp.in`

**Error: "Port 80 already in use"**
- Check what's using port 80: `sudo lsof -i :80`
- Stop conflicting service or configure Nginx properly

#### HTTPS Works But API Returns Errors

**502 Bad Gateway:**
- Backend not running: `pm2 status`
- Check backend logs: `pm2 logs operion-backend`
- Verify backend is listening on port 3000: `curl http://localhost:3000/health`

**CORS Errors:**
- Update `CORS_ORIGINS` in `.env` to include your frontend domain
- Restart backend: `pm2 restart operion-backend`

#### Certificate Renewal

Certificates auto-renew, but you can test manually:

```bash
# Test renewal (dry run)
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal
```

### Security Checklist

- ✅ HTTPS enabled for API
- ✅ HTTP redirects to HTTPS
- ✅ Security headers configured in Nginx
- ✅ CORS properly configured
- ✅ Firewall/Security group restricts ports
- ✅ SSL certificate auto-renewal enabled

### Alternative: Quick Test with IP (Not Recommended for Production)

If you need a quick test without a domain, you can use a self-signed certificate, but this will show warnings in browsers and won't work for production. For production, you **must** use a proper domain with Let's Encrypt.

### Next Steps

After HTTPS is set up:

1. ✅ Update all frontend API calls to use HTTPS
2. ✅ Test all API endpoints
3. ✅ Monitor certificate expiration (auto-renewal should handle this)
4. ✅ Set up monitoring/alerts for SSL certificate issues
5. ✅ Document the API URL for your team

### Support

If you encounter issues:

1. Check Nginx logs: `sudo tail -f /var/log/nginx/operion_error.log`
2. Check Certbot logs: `sudo tail -f /var/log/letsencrypt/letsencrypt.log`
3. Verify DNS: `dig api.cascade-erp.in`
4. Check security group: Ports 80 and 443 must be open
5. Verify backend is running: `pm2 status`

---

**Quick Command Reference:**

```bash
# Setup SSL
sudo ./deploy/ssl-setup.sh

# Check certificate status
sudo certbot certificates

# Test renewal
sudo certbot renew --dry-run

# View Nginx config
sudo nano /etc/nginx/conf.d/operion.conf

# Test Nginx config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Check backend status
pm2 status
pm2 logs operion-backend

# Test API
curl https://api.cascade-erp.in/health
```

