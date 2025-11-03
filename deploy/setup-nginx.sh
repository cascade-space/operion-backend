#!/bin/bash
# Quick Nginx Setup Script
# Sets up Nginx configuration before running SSL setup

set -e

echo "=========================================="
echo "Nginx Configuration Setup"
echo "=========================================="
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Error: Please run as root or with sudo"
    echo "Usage: sudo ./setup-nginx.sh"
    exit 1
fi

# Get current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if Nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "📦 Installing Nginx..."
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        
        if [ "$OS" = "ubuntu" ]; then
            apt update
            apt install -y nginx
        elif [ "$OS" = "amzn" ] || [ "$OS" = "rhel" ]; then
            yum install -y nginx
        fi
    fi
fi

# Get domain name
echo "Enter your API domain name (e.g., api.cascade-erp.in)"
echo "Note: Use a subdomain like 'api.yourdomain.com' for your API"
read -p "Domain name: " DOMAIN_NAME

if [ -z "$DOMAIN_NAME" ]; then
    echo "❌ Error: Domain name is required. Exiting."
    exit 1
fi

# Determine nginx config location
if [ -d "/etc/nginx/sites-available" ]; then
    # Ubuntu
    NGINX_CONFIG="/etc/nginx/sites-available/operion"
    NGINX_ENABLED="/etc/nginx/sites-enabled/operion"
    
    echo "📝 Copying nginx config for Ubuntu..."
    cp "$SCRIPT_DIR/nginx-config.conf" "$NGINX_CONFIG"
    
    # Replace domain name
    sed -i "s/your-domain.com/$DOMAIN_NAME/g" "$NGINX_CONFIG"
    
    # Create symlink
    ln -sf "$NGINX_CONFIG" "$NGINX_ENABLED"
    
    echo "✅ Created: $NGINX_CONFIG"
    echo "✅ Symlinked: $NGINX_ENABLED"
else
    # Amazon Linux / CentOS
    NGINX_CONFIG="/etc/nginx/conf.d/operion.conf"
    
    echo "📝 Copying nginx config for Amazon Linux..."
    cp "$SCRIPT_DIR/nginx-config.conf" "$NGINX_CONFIG"
    
    # Replace domain name
    sed -i "s/your-domain.com/$DOMAIN_NAME/g" "$NGINX_CONFIG"
    
    echo "✅ Created: $NGINX_CONFIG"
fi

# Test nginx configuration
echo ""
echo "🧪 Testing nginx configuration..."
if nginx -t; then
    echo "✅ Nginx configuration is valid"
    
    # Restart nginx
    echo "🔄 Restarting nginx..."
    systemctl restart nginx
    systemctl enable nginx
    
    echo ""
    echo "=========================================="
    echo "✅ Nginx Setup Complete!"
    echo "=========================================="
    echo ""
    echo "Configuration file: $NGINX_CONFIG"
    echo "Domain: $DOMAIN_NAME"
    echo ""
    echo "Next steps:"
    echo "1. Make sure DNS A record for $DOMAIN_NAME points to your EC2 IP"
    echo "2. Wait 5-10 minutes for DNS to propagate"
    echo "3. Verify DNS: dig $DOMAIN_NAME +short"
    echo "4. Run SSL setup: sudo ./ssl-setup.sh"
    echo ""
else
    echo "❌ Error: Nginx configuration test failed"
    echo "Please check the configuration manually"
    exit 1
fi

