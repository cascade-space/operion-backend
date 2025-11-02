/**
 * PM2 Ecosystem Configuration
 * 
 * Use this file if deploying to AWS EC2 (not Elastic Beanstalk).
 * Elastic Beanstalk manages processes automatically, so PM2 is not required.
 * 
 * Installation:
 *   npm install -g pm2
 * 
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 stop operion-backend
 *   pm2 restart operion-backend
 *   pm2 logs operion-backend
 *   pm2 monit
 */

module.exports = {
  apps: [{
    name: 'operion-backend',
    script: './dist/server.js',
    instances: 1, // Use 1 for free tier, scale to 'max' for production with load balancer
    exec_mode: 'fork', // Use 'fork' for single instance, 'cluster' for multiple instances
    env: {
      NODE_ENV: 'production',
      PORT: 3000
      // Add other environment variables here or use .env file
      // PM2 will automatically load .env from the app directory
    },
    // Logging configuration
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Auto-restart configuration
    autorestart: true,
    watch: false, // Set to true for development, false for production
    max_memory_restart: '500M', // Restart if memory exceeds 500MB
    
    // Advanced options
    min_uptime: '10s', // Minimum uptime to consider app as stable
    max_restarts: 10, // Maximum number of restarts in case of crash
    restart_delay: 4000, // Delay between restarts (ms)
    
    // Graceful shutdown
    kill_timeout: 5000, // Time to wait for graceful shutdown (ms)
    wait_ready: true, // Wait for app to emit 'ready' event
    listen_timeout: 10000, // Time to wait for app to start listening
    
    // Source map support
    source_map_support: true,
    
    // Instance variables (can be overridden with --update-env)
    instance_var: 'INSTANCE_ID',
    
    // Cron restart (optional - restart daily at 3 AM)
    // cron_restart: '0 3 * * *'
  }]
};

