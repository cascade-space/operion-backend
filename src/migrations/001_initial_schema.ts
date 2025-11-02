import mongoose from 'mongoose';
import logger from '@/utils/logger';

/**
 * Initial Schema Migration
 * 
 * This is a placeholder migration to initialize the migration system.
 * Future migrations should be added as 002_description.ts, 003_description.ts, etc.
 */
export default {
  async up(): Promise<void> {
    logger.info('Running migration 001: Initial schema');
    
    // Ensure migrations collection exists
    await mongoose.connection.createCollection('migrations').catch(() => {
      // Collection may already exist
    });

    // Add any initial schema setup here
    // For now, this is just a placeholder

    logger.info('Migration 001 completed');
  },

  async down(): Promise<void> {
    logger.info('Rolling back migration 001: Initial schema');
    
    // Rollback logic here
    // Since this is just initialization, there's nothing to rollback

    logger.info('Migration 001 rolled back');
  }
};

