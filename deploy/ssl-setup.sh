#!/bin/bash
# SSL/HTTPS Setup Script using Let's Encrypt (Certbot)
# This sets up HTTPS for your domain
#
# Usage: sudo ./ssl-setup.sh
# Or: sudo bash ssl-setup.sh

set -e

echo "=========================================="
echo "SSL/HTTPS Setup with Let's Encrypt"
echo "=========================================="
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Error: Please run as root or with sudo"
    echo "Usage: sudo ./ssl-setup.sh"
    exit 1
fi

# Install required tools
echo "📦 Installing required packages..."
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    
    if [ "$OS" = "ubuntu" ]; then
        apt update
        apt install -y certbot python3-certbot-nginx dnsutils
    elif [ "$OS" = "amzn" ] || [ "$OS" = "rhel" ]; then
        # Amazon Linux 2023
        dnf install -y certbot python3-certbot-nginx bind-utils
    else
        echo "⚠️  Unsupported OS. Please install certbot manually."
        exit 1
    fi
else
    echo "⚠️  Cannot detect OS. Please install certbot manually."
    exit 1
fi

# Check if Nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "❌ Error: Nginx is not installed."
    echo "Please install Nginx first: sudo apt install nginx (Ubuntu) or sudo yum install nginx (Amazon Linux)"
    exit 1
fi

# Find Nginx config file
NGINX_CONFIG="/etc/nginx/sites-available/operion"
if [ ! -f "$NGINX_CONFIG" ]; then
    NGINX_CONFIG="/etc/nginx/conf.d/operion.conf"
fi

if [ ! -f "$NGINX_CONFIG" ]; then
    echo "⚠️  Nginx config not found at /etc/nginx/sites-available/operion or /etc/nginx/conf.d/operion.conf"
    echo "Please set up Nginx configuration first."
    read -p "Continue anyway? (y/N): " CONTINUE
    if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
        exit 1
    fi
fi

# Get domain name
echo ""
echo "Enter your API domain name (e.g., api.cascade-erp.in)"
echo "This should be a subdomain that points to your EC2 instance IP"
read -p "Domain name: " DOMAIN_NAME

if [ -z "$DOMAIN_NAME" ]; then
    echo "❌ Error: Domain name is required. Exiting."
    exit 1
fi

# Validate domain format
if [[ ! "$DOMAIN_NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$ ]]; then
    echo "⚠️  Warning: Domain name format may be invalid: $DOMAIN_NAME"
    read -p "Continue anyway? (y/N): " CONTINUE
    if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
        exit 1
    fi
fi

# Check if domain points to this server
echo ""
echo "🔍 Verifying domain DNS configuration..."
SERVER_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip || curl -s icanhazip.com)

if [ -z "$SERVER_IP" ]; then
    echo "⚠️  Warning: Could not determine server IP"
else
    echo "Server IP: $SERVER_IP"
    
    # Try to resolve domain IP
    DOMAIN_IP=$(dig +short $DOMAIN_NAME 2>/dev/null | tail -n1 || echo "")
    
    if [ -z "$DOMAIN_IP" ]; then
        echo "⚠️  Warning: Could not resolve $DOMAIN_NAME"
        echo "Please ensure your DNS A record for $DOMAIN_NAME points to: $SERVER_IP"
    else
        echo "Domain IP: $DOMAIN_IP"
        
        if [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
            echo "⚠️  Warning: Domain does not appear to point to this server."
            echo "Expected: $SERVER_IP"
            echo "Got: $DOMAIN_IP"
            echo ""
            echo "Please ensure your DNS A record for $DOMAIN_NAME points to: $SERVER_IP"
            echo "DNS changes can take a few minutes to propagate."
            read -p "Continue anyway? (y/N): " CONTINUE
            if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
                exit 1
            fi
        else
            echo "✅ Domain DNS is correctly configured!"
        fi
    fi
fi

# Update Nginx config with domain name
if [ -f "$NGINX_CONFIG" ]; then
    echo ""
    echo "📝 Updating Nginx configuration..."
    
    # Backup original config
    cp "$NGINX_CONFIG" "${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
    
    # Update server_name in HTTP server block (replace your-domain.com)
    sed -i "s/server_name.*your-domain.com.*/server_name $DOMAIN_NAME;/g" "$NGINX_CONFIG"
    
    # Test Nginx configuration (before SSL, should only have HTTP block)
    if nginx -t; then
        echo "✅ Nginx configuration is valid"
        systemctl reload nginx || systemctl restart nginx
        echo "✅ Nginx reloaded"
    else
        echo "❌ Error: Nginx configuration test failed"
        echo "Restoring backup..."
        cp "${NGINX_CONFIG}.backup."* "$NGINX_CONFIG" 2>/dev/null || true
        exit 1
    fi
fi

# Get email for Let's Encrypt
echo ""
read -p "Enter email for Let's Encrypt notifications (optional, press Enter to skip): " EMAIL
EMAIL_ARG=""
if [ -n "$EMAIL" ]; then
    EMAIL_ARG="--email $EMAIL"
else
    EMAIL_ARG="--register-unsafely-without-email"
fi

# Obtain SSL certificate
echo ""
echo "🔒 Obtaining SSL certificate from Let's Encrypt..."
echo "This may take a minute..."
echo ""

if certbot --nginx -d $DOMAIN_NAME --non-interactive --agree-tos $EMAIL_ARG --redirect; then
    echo ""
    echo "=========================================="
    echo "✅ SSL Certificate Installed Successfully!"
    echo "=========================================="
    echo ""
    echo "🌐 Your API is now available at: https://$DOMAIN_NAME"
    echo ""
    
    # Certbot automatically updates the nginx config, but let's verify
    if nginx -t; then
        echo "✅ Nginx configuration verified after SSL setup"
        systemctl reload nginx || systemctl restart nginx
    else
        echo "⚠️  Warning: Nginx configuration test failed after SSL setup"
        echo "Please check: sudo nginx -t"
    fi
    echo ""
    
    # Test SSL
    echo "🔍 Testing SSL certificate..."
    if curl -s "https://$DOMAIN_NAME/health" > /dev/null 2>&1; then
        echo "✅ HTTPS endpoint is working!"
    else
        echo "⚠️  HTTPS endpoint test failed, but certificate is installed"
        echo "Check that your backend is running: pm2 status"
    fi
    
    # Setup auto-renewal
    echo ""
    echo "🔄 Setting up automatic certificate renewal..."
    systemctl enable certbot.timer 2>/dev/null || true
    systemctl start certbot.timer 2>/dev/null || true
    
    # Test renewal
    echo "🧪 Testing certificate renewal..."
    certbot renew --dry-run > /dev/null 2>&1 && echo "✅ Auto-renewal test passed" || echo "⚠️  Auto-renewal test had issues (check manually)"
    
    echo ""
    echo "=========================================="
    echo "📋 Next Steps:"
    echo "=========================================="
    echo ""
    echo "1. ✅ Update your frontend API URL from:"
    echo "   http://3.107.223.34:3000"
    echo "   to:"
    echo "   https://$DOMAIN_NAME"
    echo ""
    echo "2. ✅ Update CORS_ORIGINS in your backend .env to include your frontend domain"
    echo ""
    echo "3. ✅ Test the API endpoint:"
    echo "   curl https://$DOMAIN_NAME/health"
    echo ""
    echo "4. ✅ Certificate will auto-renew. Manual renewal:"
    echo "   sudo certbot renew"
    echo ""
else
    echo ""
    echo "❌ SSL certificate installation failed."
    echo ""
    echo "Common issues:"
    echo "- DNS not configured correctly"
    echo "- Port 80 not accessible from internet"
    echo "- Domain already has a certificate"
    echo "- Rate limit exceeded (wait 1 hour)"
    echo ""
    echo "Check logs: sudo tail -f /var/log/letsencrypt/letsencrypt.log"
    exit 1
fi

