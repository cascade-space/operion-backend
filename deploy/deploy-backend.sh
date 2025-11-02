#!/bin/bash
# Complete Backend Deployment Script
# This script deploys the Operion backend to EC2

set -e

echo "=========================================="
echo "Operion Backend Deployment Script"
echo "=========================================="

# Get current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_DIR"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Error: .env file not found!"
    echo "Please create .env file from env.production.example"
    echo ""
    echo "cp env.production.example .env"
    echo "nano .env"
    exit 1
fi

# Load environment variables
source .env 2>/dev/null || true

# Check required environment variables
REQUIRED_VARS=("MONGODB_URI_PROD" "JWT_SECRET" "JWT_REFRESH_SECRET")
MISSING_VARS=()

for VAR in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!VAR}" ]; then
        MISSING_VARS+=("$VAR")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo "Error: Missing required environment variables:"
    for VAR in "${MISSING_VARS[@]}"; do
        echo "  - $VAR"
    done
    echo ""
    echo "Please update your .env file with all required variables."
    exit 1
fi

# Check if MongoDB connection string is set to placeholder
if [[ "$MONGODB_URI_PROD" == *"CHANGE_ME"* ]] || [[ "$MONGODB_URI_PROD" == *"your-"* ]]; then
    echo "Warning: MONGODB_URI_PROD appears to contain placeholder values."
    echo "Please update with your actual MongoDB connection string."
    read -p "Continue anyway? (y/N): " CONTINUE
    if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
        exit 1
    fi
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Build application
echo "Building application..."
npm run build

if [ ! -f "dist/server.js" ]; then
    echo "Error: Build failed - dist/server.js not found"
    exit 1
fi

echo "✓ Build successful"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "PM2 not found. Installing..."
    sudo npm install -g pm2
fi

# Stop existing application if running
echo "Stopping existing application (if running)..."
pm2 stop operion-backend 2>/dev/null || true
pm2 delete operion-backend 2>/dev/null || true

# Start application with PM2
echo "Starting application with PM2..."
pm2 start ecosystem.config.cjs

# Save PM2 configuration
pm2 save

# Show status
echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
pm2 status
echo ""
echo "View logs: pm2 logs operion-backend"
echo "Monitor: pm2 monit"
echo ""

# Test health endpoint
sleep 3
echo "Testing health endpoint..."
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✓ Health check passed"
else
    echo "⚠ Health check failed - check logs: pm2 logs operion-backend"
fi

echo ""
echo "Next steps:"
echo "1. Verify application is running: pm2 status"
echo "2. Check logs: pm2 logs operion-backend"
echo "3. Configure Nginx reverse proxy (if not done)"
echo "4. Update CORS_ORIGINS with your frontend URL"
echo ""

