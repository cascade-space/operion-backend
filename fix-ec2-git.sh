#!/bin/bash
# Fix EC2 Git Pull Error - Stash local changes and pull
# Run this script on EC2 instance

echo "Stashing local changes to package-lock.json..."
git stash push -m "Stash package-lock.json before pull" package-lock.json

echo "Pulling latest changes..."
git pull

echo "Rebuilding project..."
npm run build

echo "Restarting PM2..."
pm2 restart operion-backend

echo "✓ Done! Checking logs..."
pm2 logs operion-backend --lines 20

