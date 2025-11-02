#!/bin/bash
# SSL/HTTPS Setup Script using Let's Encrypt (Certbot)
# This sets up HTTPS for your domain

set -e

echo "=========================================="
echo "SSL/HTTPS Setup with Let's Encrypt"
echo "=========================================="

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root or with sudo"
    exit 1
fi

# Install Certbot
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    
    if [ "$OS" = "ubuntu" ]; then
        apt update
        apt install -y certbot python3-certbot-nginx
    elif [ "$OS" = "amzn" ] || [ "$OS" = "rhel" ]; then
        # Amazon Linux 2023
        dnf install -y certbot python3-certbot-nginx
    fi
fi

# Get domain name
read -p "Enter your domain name (e.g., api.yourdomain.com): " DOMAIN_NAME

if [ -z "$DOMAIN_NAME" ]; then
    echo "Domain name is required. Exiting."
    exit 1
fi

# Check if domain points to this server
echo "Verifying domain points to this server..."
SERVER_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip)
DOMAIN_IP=$(dig +short $DOMAIN_NAME | tail -n1)

echo "Server IP: $SERVER_IP"
echo "Domain IP: $DOMAIN_IP"

if [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
    echo "Warning: Domain does not appear to point to this server."
    echo "Please ensure your domain DNS A record points to: $SERVER_IP"
    read -p "Continue anyway? (y/N): " CONTINUE
    if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
        exit 1
    fi
fi

# Update Nginx config with domain name
NGINX_CONFIG="/etc/nginx/sites-available/operion"
if [ ! -f "$NGINX_CONFIG" ]; then
    NGINX_CONFIG="/etc/nginx/conf.d/operion.conf"
fi

if [ -f "$NGINX_CONFIG" ]; then
    # Update server_name
    sed -i "s/server_name.*/server_name $DOMAIN_NAME;/" $NGINX_CONFIG
    nginx -t && systemctl reload nginx
fi

# Obtain SSL certificate
echo "Obtaining SSL certificate..."
certbot --nginx -d $DOMAIN_NAME --non-interactive --agree-tos --email admin@$DOMAIN_NAME --redirect

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "SSL Certificate Installed Successfully!"
    echo "=========================================="
    echo ""
    echo "Your site is now available at: https://$DOMAIN_NAME"
    echo ""
    echo "Certificate will auto-renew. Test renewal with:"
    echo "  sudo certbot renew --dry-run"
    echo ""
    
    # Setup auto-renewal
    systemctl enable certbot.timer
    systemctl start certbot.timer
    
    echo "Auto-renewal enabled. Certificate will renew automatically."
else
    echo "SSL certificate installation failed."
    exit 1
fi

