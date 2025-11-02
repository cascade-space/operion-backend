#!/bin/bash
# EC2 Deployment Setup Script for Operion Backend
# Run this script on a fresh EC2 instance (Ubuntu 22.04 or Amazon Linux 2023)

set -e  # Exit on error

echo "=========================================="
echo "Operion Backend EC2 Setup Script"
echo "=========================================="

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "Cannot detect OS. Exiting."
    exit 1
fi

echo "Detected OS: $OS"

# Update system
echo "Updating system packages..."
if [ "$OS" = "ubuntu" ]; then
    sudo apt update && sudo apt upgrade -y
elif [ "$OS" = "amzn" ] || [ "$OS" = "rhel" ]; then
    sudo yum update -y
fi

# Install Node.js 18
echo "Installing Node.js 18..."
if [ "$OS" = "ubuntu" ]; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
elif [ "$OS" = "amzn" ] || [ "$OS" = "rhel" ]; then
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
    sudo yum install -y nodejs
fi

# Verify Node.js installation
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
echo "✓ Node.js installed: $NODE_VERSION"
echo "✓ npm installed: $NPM_VERSION"

# Install PM2
echo "Installing PM2..."
sudo npm install -g pm2

# Install Git
echo "Installing Git..."
if [ "$OS" = "ubuntu" ]; then
    sudo apt install -y git
elif [ "$OS" = "amzn" ] || [ "$OS" = "rhel" ]; then
    sudo yum install -y git
fi

# Install Nginx
echo "Installing Nginx..."
if [ "$OS" = "ubuntu" ]; then
    sudo apt install -y nginx
elif [ "$OS" = "amzn" ] || [ "$OS" = "rhel" ]; then
    sudo yum install -y nginx
fi

# Create application directory
echo "Creating application directory..."
APP_DIR="$HOME/operion"
mkdir -p $APP_DIR
cd $APP_DIR

echo ""
echo "=========================================="
echo "Setup completed successfully!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Clone your repository:"
echo "   cd $APP_DIR"
echo "   git clone https://github.com/your-username/operion.git ."
echo ""
echo "2. Install MongoDB (run deploy/mongodb-setup.sh)"
echo ""
echo "3. Configure environment variables:"
echo "   cd Backend"
echo "   cp env.production.example .env"
echo "   nano .env"
echo ""
echo "4. Build and start application:"
echo "   npm install"
echo "   npm run build"
echo "   npm run pm2:start"
echo ""

