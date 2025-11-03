# Build Troubleshooting Guide

## If Build Gets Stuck

### Option 1: Cancel and Run Commands Separately

Press `Ctrl+C` to cancel, then run:

```bash
# Step 1: Run TypeScript compiler
tsc

# Step 2: If tsc completes successfully, run tsc-alias
tsc-alias

# Step 3: Check for errors in each step
```

### Option 2: Check System Resources

In another terminal, check if the process is actually working:

```bash
# Check CPU/memory usage
top

# Or check Node processes
ps aux | grep node
```

### Option 3: Build Without tsc-alias (Temporary)

If `tsc-alias` is stuck, you can skip it temporarily (path aliases will be resolved at runtime):

```bash
# Just compile TypeScript
tsc

# The application should still work because of tsconfig-paths-bootstrap.js
# But this is not recommended for production
```

### Option 4: Check for TypeScript Errors

Run TypeScript compiler with verbose output:

```bash
tsc --listFiles | head -20  # See what files are being compiled
```

### Option 5: Clean Build

Sometimes old build artifacts cause issues:

```bash
# Remove old build
rm -rf dist/

# Clean TypeScript cache
rm -rf node_modules/.cache

# Rebuild
npm run build
```

## Quick Restart (If Build is Taking Too Long)

If you need to restart the server quickly and the build is stuck:

1. Press `Ctrl+C` to cancel
2. Run `tsc` only (skip tsc-alias for now)
3. Restart PM2: `pm2 restart operion-backend`

The application will use `tsconfig-paths-bootstrap.js` to resolve path aliases at runtime.

## Verify Build Success

After build completes, check:

```bash
# Check if dist folder was created
ls -la dist/

# Check if main file exists
ls -la dist/server.js

# Check if path aliases were resolved (should show relative paths, not @/)
grep -r "@/middleware" dist/ | head -5
```

If the grep shows no results (or relative paths), `tsc-alias` worked correctly.

