#!/bin/bash
# MongoDB Backup Script
# Automatically backs up MongoDB database and compresses it

set -e

# Configuration
BACKUP_DIR="$HOME/backups/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="${MONGODB_DB_NAME:-operion_prod}"
DB_USER="${MONGODB_USER:-operion_app}"
DB_PASS="${MONGODB_PASS}"
RETENTION_DAYS=7

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "MongoDB Backup Script"
echo "=========================================="

# Check if password is set
if [ -z "$DB_PASS" ]; then
    echo -e "${YELLOW}Warning: MONGODB_PASS not set.${NC}"
    echo "Please set it as environment variable or edit this script."
    read -sp "Enter MongoDB password: " DB_PASS
    echo ""
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup MongoDB
echo "Creating backup..."
mongodump \
  --uri="mongodb://${DB_USER}:${DB_PASS}@localhost:27017/${DB_NAME}?authSource=${DB_NAME}" \
  --out="$BACKUP_DIR/backup_${DATE}" \
  2>&1 | grep -v "writing" || true

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo -e "${GREEN}✓ Backup created${NC}"
else
    echo -e "${RED}✗ Backup failed${NC}"
    exit 1
fi

# Compress backup
echo "Compressing backup..."
tar -czf "$BACKUP_DIR/backup_${DATE}.tar.gz" -C "$BACKUP_DIR" "backup_${DATE}" 2>/dev/null
rm -rf "$BACKUP_DIR/backup_${DATE}"

if [ -f "$BACKUP_DIR/backup_${DATE}.tar.gz" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_DIR/backup_${DATE}.tar.gz" | cut -f1)
    echo -e "${GREEN}✓ Backup compressed: backup_${DATE}.tar.gz (${BACKUP_SIZE})${NC}"
else
    echo -e "${RED}✗ Compression failed${NC}"
    exit 1
fi

# Cleanup old backups
echo "Cleaning up old backups (keeping last ${RETENTION_DAYS} days)..."
find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime +${RETENTION_DAYS} -delete
REMAINING=$(find "$BACKUP_DIR" -name "backup_*.tar.gz" | wc -l)
echo "Remaining backups: $REMAINING"

echo ""
echo -e "${GREEN}Backup completed successfully!${NC}"
echo "Location: $BACKUP_DIR/backup_${DATE}.tar.gz"
echo ""

