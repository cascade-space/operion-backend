#!/bin/bash
# Fix EC2 Build Stuck Issue

echo "🔍 Checking system resources..."
echo "Memory:"
free -h
echo ""
echo "CPU:"
uptime
echo ""
echo "Disk:"
df -h /
echo ""

# Kill any hanging build processes
echo "🛑 Killing any hanging Node/TypeScript processes..."
pkill -9 node || true
pkill -9 tsc || true
sleep 2

# Check if swap is available
echo "🔍 Checking swap..."
swapon --show

# If no swap, suggest adding it
if [ -z "$(swapon --show)" ]; then
    echo "⚠️  No swap space detected!"
    echo "💡 Would you like to add 2GB swap? (Helps with memory-intensive builds)"
    echo "   Run: sudo fallocate -l 2G /swapfile"
    echo "   sudo chmod 600 /swapfile"
    echo "   sudo mkswap /swapfile"
    echo "   sudo swapon /swapfile"
    echo ""
fi

echo "🔨 Attempting build with increased memory and timeout..."
# Set Node memory limit and use timeout to prevent infinite hang
NODE_OPTIONS="--max-old-space-size=2048" timeout 300 npm run build

BUILD_EXIT=$?

if [ $BUILD_EXIT -eq 124 ]; then
    echo "❌ Build timed out after 5 minutes"
    echo "💡 This suggests the instance is too resource-constrained"
    echo ""
    echo "Alternative approaches:"
    echo "1. Build locally on Windows and copy dist/ folder to EC2"
    echo "2. Upgrade EC2 instance size temporarily for build"
    echo "3. Add swap space (see above)"
    echo "4. Use pre-compiled code from local machine"
    exit 1
elif [ $BUILD_EXIT -eq 0 ]; then
    echo "✅ Build completed successfully!"
    echo ""
    echo "🔄 Restarting PM2..."
    pm2 restart operion-backend
    echo ""
    echo "📊 PM2 Status:"
    pm2 status
    echo ""
    echo "📝 Recent logs:"
    pm2 logs operion-backend --lines 20 --nostream
    exit 0
else
    echo "❌ Build failed with exit code $BUILD_EXIT"
    exit $BUILD_EXIT
fi

