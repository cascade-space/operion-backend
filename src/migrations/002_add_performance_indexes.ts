import mongoose from 'mongoose';
import logger from '@/utils/logger';

/**
 * Migration 002: Add Performance Indexes
 * 
 * Adds critical database indexes for improved query performance.
 * Uses background indexing to avoid blocking database operations.
 */
export default {
  async up(): Promise<void> {
    logger.info('Running migration 002: Add performance indexes');
    
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not available');
    }

    try {
      // Attendance indexes
      logger.info('Creating Attendance indexes...');
      await db.collection('attendances').createIndex(
        { factoryId: 1, date: -1 },
        { background: true, name: 'factoryId_date_desc' }
      ).catch(err => {
        if (!err.message?.includes('already exists')) throw err;
        logger.info('Index factoryId_date_desc already exists on attendances');
      });

      await db.collection('attendances').createIndex(
        { employeeId: 1, date: -1 },
        { background: true, name: 'employeeId_date_desc' }
      ).catch(err => {
        if (!err.message?.includes('already exists')) throw err;
        logger.info('Index employeeId_date_desc already exists on attendances');
      });

      await db.collection('attendances').createIndex(
        { factoryId: 1, createdAt: -1 },
        { background: true, name: 'factoryId_createdAt_desc' }
      ).catch(err => {
        if (!err.message?.includes('already exists')) throw err;
        logger.info('Index factoryId_createdAt_desc already exists on attendances');
      });

      await db.collection('attendances').createIndex(
        { processId: 1, date: -1 },
        { background: true, name: 'processId_date_desc' }
      ).catch(err => {
        if (!err.message?.includes('already exists')) throw err;
        logger.info('Index processId_date_desc already exists on attendances');
      });

      // Factory indexes
      logger.info('Creating Factory indexes...');
      await db.collection('factories').createIndex(
        { isActive: 1, createdAt: -1 },
        { background: true, name: 'isActive_createdAt_desc' }
      ).catch(err => {
        if (!err.message?.includes('already exists')) throw err;
        logger.info('Index isActive_createdAt_desc already exists on factories');
      });

      // Product indexes
      logger.info('Creating Product indexes...');
      await db.collection('products').createIndex(
        { factoryId: 1, createdAt: -1 },
        { background: true, name: 'factoryId_createdAt_desc' }
      ).catch(err => {
        if (!err.message?.includes('already exists')) throw err;
        logger.info('Index factoryId_createdAt_desc already exists on products');
      });

      // Process indexes
      logger.info('Creating Process indexes...');
      await db.collection('processes').createIndex(
        { factoryId: 1, createdAt: -1 },
        { background: true, name: 'factoryId_createdAt_desc' }
      ).catch(err => {
        if (!err.message?.includes('already exists')) throw err;
        logger.info('Index factoryId_createdAt_desc already exists on processes');
      });

      await db.collection('processes').createIndex(
        { factoryId: 1, order: 1 },
        { background: true, name: 'factoryId_order_asc' }
      ).catch(err => {
        if (!err.message?.includes('already exists')) throw err;
        logger.info('Index factoryId_order_asc already exists on processes');
      });

      // Machine indexes
      logger.info('Creating Machine indexes...');
      await db.collection('machines').createIndex(
        { factoryId: 1, createdAt: -1 },
        { background: true, name: 'factoryId_createdAt_desc' }
      ).catch(err => {
        if (!err.message?.includes('already exists')) throw err;
        logger.info('Index factoryId_createdAt_desc already exists on machines');
      });

      // WorkEntry indexes
      logger.info('Creating WorkEntry indexes...');
      await db.collection('workentries').createIndex(
        { factoryId: 1, productId: 1, processId: 1, createdAt: -1 },
        { background: true, name: 'factoryId_productId_processId_createdAt_desc' }
      ).catch(err => {
        if (!err.message?.includes('already exists')) throw err;
        logger.info('Index factoryId_productId_processId_createdAt_desc already exists on workentries');
      });

      await db.collection('workentries').createIndex(
        { factoryId: 1, validationStatus: 1, createdAt: -1 },
        { background: true, name: 'factoryId_validationStatus_createdAt_desc' }
      ).catch(err => {
        if (!err.message?.includes('already exists')) throw err;
        logger.info('Index factoryId_validationStatus_createdAt_desc already exists on workentries');
      });

      logger.info('Migration 002 completed successfully');
    } catch (error) {
      logger.error('Error in migration 002', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },

  async down(): Promise<void> {
    logger.info('Rolling back migration 002: Remove performance indexes');
    
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not available');
    }

    try {
      // Drop Attendance indexes
      await db.collection('attendances').dropIndex('factoryId_date_desc').catch(() => {});
      await db.collection('attendances').dropIndex('employeeId_date_desc').catch(() => {});
      await db.collection('attendances').dropIndex('factoryId_createdAt_desc').catch(() => {});
      await db.collection('attendances').dropIndex('processId_date_desc').catch(() => {});

      // Drop Factory indexes
      await db.collection('factories').dropIndex('isActive_createdAt_desc').catch(() => {});

      // Drop Product indexes
      await db.collection('products').dropIndex('factoryId_createdAt_desc').catch(() => {});

      // Drop Process indexes
      await db.collection('processes').dropIndex('factoryId_createdAt_desc').catch(() => {});
      await db.collection('processes').dropIndex('factoryId_order_asc').catch(() => {});

      // Drop Machine indexes
      await db.collection('machines').dropIndex('factoryId_createdAt_desc').catch(() => {});

      // Drop WorkEntry indexes
      await db.collection('workentries').dropIndex('factoryId_productId_processId_createdAt_desc').catch(() => {});
      await db.collection('workentries').dropIndex('factoryId_validationStatus_createdAt_desc').catch(() => {});

      logger.info('Migration 002 rolled back successfully');
    } catch (error) {
      logger.error('Error rolling back migration 002', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
};

