import mongoose from 'mongoose';
import { connectDB } from '../config/database';
import migrationRunner from '../migrations/migrationRunner';
import logger from '../utils/logger';

/**
 * Run database migrations
 * 
 * Usage: npm run migrate
 * Or: tsx src/scripts/runMigrations.ts
 */
const runMigrations = async () => {
  try {
    logger.info('Connecting to database...');
    await connectDB();
    
    logger.info('Running migrations...');
    await migrationRunner.migrate();
    
    const status = await migrationRunner.getStatus();
    logger.info('Migration status', status);
    
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed', { error: error instanceof Error ? error.stack : String(error) });
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
};

// Run if executed directly
if (require.main === module) {
  runMigrations();
}

export default runMigrations;

