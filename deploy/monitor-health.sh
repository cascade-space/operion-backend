#!/bin/bash
# Health Check Monitoring Script
# Run this as a cron job to monitor backend health

HEALTH_URL="${HEALTH_URL:-http://localhost:3000/health}"
LOG_FILE="${LOG_FILE:-$HOME/health-check.log}"
ALERT_EMAIL="${ALERT_EMAIL:-}"

# Check health endpoint
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    STATUS="OK"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Health check: OK (HTTP $HTTP_CODE)" >> "$LOG_FILE"
    exit 0
else
    STATUS="FAILED"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Health check: FAILED (HTTP $HTTP_CODE)" >> "$LOG_FILE"
    
    # Try to restart if PM2 is available
    if command -v pm2 &> /dev/null; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Attempting to restart application..." >> "$LOG_FILE"
        pm2 restart operion-backend >> "$LOG_FILE" 2>&1
    fi
    
    # Send alert email if configured
    if [ -n "$ALERT_EMAIL" ] && command -v mail &> /dev/null; then
        echo "Operion backend health check failed at $(date)" | mail -s "Backend Health Alert" "$ALERT_EMAIL"
    fi
    
    exit 1
fi

