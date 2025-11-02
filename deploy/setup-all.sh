#!/bin/bash
# Complete All-in-One Setup Script
# This script runs all setup steps in sequence

set -e

echo "=========================================="
echo "Operion Complete Setup Script"
echo "=========================================="
echo ""
echo "This script will:"
echo "  1. Setup system (Node.js, PM2, Nginx)"
echo "  2. Install MongoDB"
echo "  3. Guide you through configuration"
echo ""
read -p "Continue? (y/N): " CONTINUE
if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
    exit 0
fi

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_DIR"

# Step 1: System Setup
echo ""
echo "=========================================="
echo "Step 1: System Setup"
echo "=========================================="
sudo "$SCRIPT_DIR/ec2-setup.sh"

# Step 2: MongoDB Setup
echo ""
echo "=========================================="
echo "Step 2: MongoDB Setup"
echo "=========================================="
sudo "$SCRIPT_DIR/mongodb-setup.sh"

# Step 3: Configuration
echo ""
echo "=========================================="
echo "Step 3: Environment Configuration"
echo "=========================================="

if [ ! -f ".env" ]; then
    echo "Creating .env file from template..."
    cp env.production.example .env
fi

echo ""
echo "Please edit .env file with required values:"
echo "  1. MongoDB connection string (from Step 2)"
echo "  2. JWT secrets (generate with: openssl rand -base64 32)"
echo "  3. CORS origins (your Vercel URL)"
echo ""
read -p "Press Enter when .env is configured..."

# Step 4: Deploy Backend
echo ""
echo "=========================================="
echo "Step 4: Backend Deployment"
echo "=========================================="
"$SCRIPT_DIR/deploy-backend.sh"

# Step 5: Nginx Setup
echo ""
echo "=========================================="
echo "Step 5: Nginx Configuration"
echo "=========================================="
echo "Would you like to configure Nginx now? (recommended)"
read -p "Configure Nginx? (y/N): " CONFIGURE_NGINX

if [ "$CONFIGURE_NGINX" = "y" ] || [ "$CONFIGURE_NGINX" = "Y" ]; then
    read -p "Enter your domain or EC2 public IP: " SERVER_NAME
    
    if [ -d "/etc/nginx/sites-available" ]; then
        # Ubuntu
        sudo cp "$SCRIPT_DIR/nginx-config.conf" /etc/nginx/sites-available/operion
        sudo sed -i "s/your-domain.com/$SERVER_NAME/g" /etc/nginx/sites-available/operion
        sudo ln -sf /etc/nginx/sites-available/operion /etc/nginx/sites-enabled/
    else
        # Amazon Linux
        sudo cp "$SCRIPT_DIR/nginx-config.conf" /etc/nginx/conf.d/operion.conf
        sudo sed -i "s/your-domain.com/$SERVER_NAME/g" /etc/nginx/conf.d/operion.conf
    fi
    
    sudo nginx -t
    sudo systemctl restart nginx
    sudo systemctl enable nginx
    
    echo "✓ Nginx configured and restarted"
fi

# Summary
echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "✓ System dependencies installed"
echo "✓ MongoDB installed and configured"
echo "✓ Backend application deployed"
if [ "$CONFIGURE_NGINX" = "y" ] || [ "$CONFIGURE_NGINX" = "Y" ]; then
    echo "✓ Nginx configured"
fi
echo ""
echo "Next steps:"
echo "  1. Test health endpoint: curl http://localhost:3000/health"
if [ "$CONFIGURE_NGINX" = "y" ] || [ "$CONFIGURE_NGINX" = "Y" ]; then
    echo "  2. Test via Nginx: curl http://$SERVER_NAME/health"
fi
echo "  3. Deploy frontend to Vercel"
echo "  4. Update CORS_ORIGINS in .env with Vercel URL"
echo "  5. Restart backend: pm2 restart operion-backend"
echo "  6. (Optional) Setup SSL: sudo ./deploy/ssl-setup.sh"
echo ""
echo "View logs: pm2 logs operion-backend"
echo "Monitor: pm2 monit"
echo ""

