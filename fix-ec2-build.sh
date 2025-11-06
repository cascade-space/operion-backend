#!/bin/bash
# Fix EC2 Build Issues
# This script fixes common build problems on EC2

echo "🔧 Fixing EC2 build issues..."

cd ~/operion-backend || exit 1

# Stash local changes to package-lock.json if any
echo "📦 Checking for local changes..."
if git diff --quiet package-lock.json; then
    echo "✓ No local changes to package-lock.json"
else
    echo "⚠️  Local changes detected, stashing..."
    git stash push -m "Stash package-lock.json before pull" package-lock.json
fi

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull

# Clean install dependencies
echo "🧹 Cleaning and reinstalling dependencies..."
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# Build with timeout to prevent hanging
echo "🔨 Building project (with 5min timeout)..."
timeout 300 npm run build || {
    echo "❌ Build failed or timed out"
    echo "📋 Checking for TypeScript errors..."
    npx tsc --noEmit 2>&1 | head -50
    exit 1
}

echo "✅ Build successful!"

# Restart PM2
echo "🔄 Restarting PM2..."
pm2 restart operion-backend

echo "📊 Checking PM2 status..."
pm2 status

echo "📝 Recent logs:"
pm2 logs operion-backend --lines 20 --nostream

echo "✅ Done!"

