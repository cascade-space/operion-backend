#!/bin/bash
# Operion Backend Safe Build Helper
# Runs the build with resource checks, memory limits, and timeout protection.

set -e

echo "=========================================="
echo "Operion Backend Safe Build Helper"
echo "=========================================="

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo ""
echo "🔍 Checking system resources..."
echo "Memory:"
free -h || echo "free command not available."
echo ""
echo "CPU:"
uptime || echo "uptime command not available."
echo ""
echo "Disk:"
df -h . || echo "df command not available."
echo ""

echo "🔍 Checking swap..."
if swapon --show | grep -q '.'; then
  swapon --show
else
  echo "⚠️  No swap space detected. Adding at least 1-2GB swap is recommended on small instances."
fi
echo ""

echo "📦 Installing dependencies (including dev dependencies)..."
npm install --include=dev
echo ""

echo "🔨 Building project in safe mode (memory-limited, 10 min timeout)..."
if NODE_OPTIONS='--max-old-space-size=2048' timeout 600 npm run build:safe; then
  echo ""
  echo "✅ Build completed successfully!"
else
  EXIT_CODE=$?
  echo ""
  if [ "$EXIT_CODE" -eq 124 ]; then
    echo "❌ Build timed out after 10 minutes. Consider increasing swap or instance size."
  else
    echo "❌ Build failed with exit code $EXIT_CODE"
  fi
  exit "$EXIT_CODE"
fi

echo ""
echo "📁 Dist directory contents:"
ls -lha dist || echo "dist directory not found."
echo ""

echo "✅ Done!"
echo "You can now deploy or restart PM2 (pm2 restart operion-backend)."

