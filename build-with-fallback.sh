#!/bin/bash
# Build script with fallback for tsc-alias failures
# If tsc-alias hangs or fails, falls back to tsc-only (uses runtime path resolution)

set -e

echo "=========================================="
echo "Operion Backend Build (with Fallback)"
echo "=========================================="

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo ""
echo "Step 1: Compiling TypeScript..."
if NODE_OPTIONS='--max-old-space-size=2048' timeout 600 npx tsc; then
  echo "✓ TypeScript compilation successful"
else
  EXIT_CODE=$?
  echo "❌ TypeScript compilation failed with exit code $EXIT_CODE"
  exit $EXIT_CODE
fi

echo ""
echo "Step 2: Resolving path aliases with tsc-alias..."
if timeout 300 npx tsc-alias; then
  echo "✓ Path aliases resolved successfully"
  echo "✅ Build completed with path alias resolution"
else
  EXIT_CODE=$?
  if [ "$EXIT_CODE" -eq 124 ]; then
    echo "⚠️  tsc-alias timed out after 5 minutes"
  else
    echo "⚠️  tsc-alias failed with exit code $EXIT_CODE"
  fi
  echo ""
  echo "⚠️  Falling back to runtime path resolution"
  echo "   The app will use tsconfig-paths-bootstrap.js at runtime"
  echo "   This is safe but has slight runtime overhead"
  echo ""
  echo "✅ Build completed (using runtime path resolution)"
fi

echo ""
echo "📁 Verifying build output..."
if [ -f "dist/server.js" ]; then
  echo "✓ dist/server.js exists"
  echo "✅ Build successful!"
else
  echo "❌ Build failed - dist/server.js not found"
  exit 1
fi

echo ""
echo "📊 Build summary:"
echo "   - TypeScript: ✓ Compiled"
if grep -r "@/middleware" dist/ 2>/dev/null | head -1 > /dev/null; then
  echo "   - Path aliases: ⚠️  Using runtime resolution"
else
  echo "   - Path aliases: ✓ Resolved at build time"
fi
echo ""
echo "✅ Done! You can now deploy or restart PM2."

