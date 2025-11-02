/**
 * Production Migration Script
 * 
 * Standalone script to run database migrations
 * Can be used in CI/CD pipelines or manual deployments
 * 
 * Usage:
 *   npm run migrate:run
 *   OR
 *   tsx src/scripts/run-migrations.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '@/config/database';
import migrationRunner from '@/migrations/migrationRunner';
import logger from '@/utils/logger';

// Load environment variables
dotenv.config();

async function runMigrations() {
  try {
    logger.info('Starting migration process...');
    
    // Connect to database
    await connectDB();
    logger.info('Database connected');
    
    // Run migrations
    await migrationRunner.migrate();
    
    // Get status
    const status = await migrationRunner.getStatus();
    logger.info('Migration status:', status);
    
    if (status.pending.length > 0) {
      logger.warn('Some migrations are still pending:', status.pending);
      process.exit(1);
    }
    
    logger.info('All migrations completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migration script failed', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  } finally {
    // Close database connection
    try {
      await mongoose.connection.close();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database connection', { 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

// Run migrations
runMigrations();

