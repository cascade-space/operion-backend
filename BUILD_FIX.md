# Build Fix for Path Alias Resolution

## Problem
The application fails to start with error: `Cannot find module '@/middleware/rateLimiter'`

This occurs because TypeScript path aliases (`@/*`) are not resolved in the compiled JavaScript. The compiled code still contains path aliases that Node.js cannot resolve at runtime.

## Solution
The build script has been updated to use `tsc-alias`, which rewrites path aliases to relative paths during compilation.

## Quick Fix on Production Server

SSH into your production server and run:

```bash
cd ~/operion-backend  # or wherever your backend is located

# Pull latest changes (if using git)
git pull

# Rebuild the application with the new build script
npm run build

# Restart PM2
pm2 restart operion-backend

# Check logs to verify it's working
pm2 logs operion-backend --lines 50
```

## What Changed

1. **package.json**: Build script updated from `"build": "tsc"` to `"build": "tsc && tsc-alias"`
2. **tsc-alias**: This tool rewrites all `@/*` imports to relative paths (e.g., `@/middleware/rateLimiter` → `./middleware/rateLimiter`)

## Verification

After rebuilding, the compiled JavaScript files in `dist/` should have relative paths instead of path aliases. You can verify:

```bash
grep -r "@/middleware" dist/ | head -5
```

If `tsc-alias` ran successfully, this should return no results (or show relative paths like `../middleware/rateLimiter`).

## Fallback

If for any reason `tsc-alias` fails or is not available, the `tsconfig-paths-bootstrap.js` file should handle runtime path resolution. However, using `tsc-alias` is preferred as it eliminates runtime overhead.

