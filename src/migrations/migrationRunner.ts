import mongoose from 'mongoose';
import logger from '@/utils/logger';
import path from 'path';
import fs from 'fs/promises';

export interface Migration {
  up: () => Promise<void>;
  down: () => Promise<void>;
  version: string;
  description: string;
}

const MIGRATION_COLLECTION = 'migrations';

interface MigrationRecord {
  version: string;
  appliedAt: Date;
  description: string;
}

/**
 * Migration Runner
 * 
 * Manages database schema migrations with version tracking.
 * 
 * Usage:
 * 1. Create migration files in migrations/ directory: 001_description.ts
 * 2. Each migration exports up() and down() functions
 * 3. Run migrations: npm run migrate
 * 4. Or set AUTO_MIGRATE=true to run on startup
 */
class MigrationRunner {
  private migrationsPath: string;

  constructor() {
    this.migrationsPath = path.join(process.cwd(), 'src', 'migrations');
  }

  /**
   * Get all migration files sorted by version
   */
  private async getMigrationFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.migrationsPath);
      return files
        .filter(file => file.endsWith('.ts') && file !== 'migrationRunner.ts' && !file.includes('.test.'))
        .sort();
    } catch (error) {
      logger.error('Error reading migration files', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  /**
   * Get applied migrations from database
   */
  private async getAppliedMigrations(): Promise<string[]> {
    try {
      const MigrationModel = mongoose.connection.collection(MIGRATION_COLLECTION);
      const records = await MigrationModel.find({}).toArray();
      return records.map((r: any) => r.version);
    } catch (error) {
      logger.warn('Error reading applied migrations, assuming none', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  /**
   * Record migration as applied
   */
  private async recordMigration(version: string, description: string): Promise<void> {
    try {
      const MigrationModel = mongoose.connection.collection(MIGRATION_COLLECTION);
      await MigrationModel.insertOne({
        version,
        description,
        appliedAt: new Date()
      });
    } catch (error) {
      logger.error('Error recording migration', { version, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Remove migration record (for rollback)
   */
  private async removeMigrationRecord(version: string): Promise<void> {
    try {
      const MigrationModel = mongoose.connection.collection(MIGRATION_COLLECTION);
      await MigrationModel.deleteOne({ version });
    } catch (error) {
      logger.error('Error removing migration record', { version, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Load migration module
   */
  private async loadMigration(fileName: string): Promise<Migration | null> {
    try {
      const filePath = path.join(this.migrationsPath, fileName);
      // In production, migrations are in dist/migrations
      const distPath = path.join(process.cwd(), 'dist', 'migrations', fileName.replace('.ts', '.js'));
      
      let migrationModule;
      if (process.env.NODE_ENV === 'production' && require('fs').existsSync(distPath)) {
        migrationModule = require(distPath);
      } else {
        // For development, use tsx or ts-node
        migrationModule = await import(filePath);
      }

      if (!migrationModule.default || !migrationModule.default.up || !migrationModule.default.down) {
        logger.warn(`Migration ${fileName} does not export default with up/down methods`);
        return null;
      }

      const version = fileName.split('_')[0];
      const description = fileName.replace(/^\d+_/, '').replace(/\.ts$/, '');

      return {
        version,
        description,
        up: migrationModule.default.up,
        down: migrationModule.default.down
      };
    } catch (error) {
      logger.error('Error loading migration', { fileName, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Run all pending migrations
   */
  async migrate(): Promise<void> {
    try {
      logger.info('Starting migration process');

      // Ensure migrations collection exists
      await mongoose.connection.createCollection(MIGRATION_COLLECTION).catch(() => {
        // Collection may already exist
      });

      const migrationFiles = await this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations();

      const pendingMigrations = migrationFiles.filter(file => {
        const version = file.split('_')[0];
        return !appliedMigrations.includes(version);
      });

      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations');
        return;
      }

      logger.info(`Found ${pendingMigrations.length} pending migrations`);

      for (const file of pendingMigrations) {
        const migration = await this.loadMigration(file);
        if (!migration) {
          logger.warn(`Skipping migration ${file} - failed to load`);
          continue;
        }

        logger.info(`Running migration ${migration.version}: ${migration.description}`);
        try {
          await migration.up();
          await this.recordMigration(migration.version, migration.description);
          logger.info(`Migration ${migration.version} applied successfully`);
        } catch (error) {
          logger.error(`Migration ${migration.version} failed`, { error: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      }

      logger.info('Migration process completed');
    } catch (error) {
      logger.error('Migration process failed', { error: error instanceof Error ? error.stack : String(error) });
      throw error;
    }
  }

  /**
   * Rollback last migration
   */
  async rollback(): Promise<void> {
    try {
      logger.info('Starting rollback process');

      const appliedMigrations = await this.getAppliedMigrations();
      if (appliedMigrations.length === 0) {
        logger.info('No migrations to rollback');
        return;
      }

      // Get the last applied migration
      const lastVersion = appliedMigrations.sort().reverse()[0];
      const migrationFiles = await this.getMigrationFiles();
      const migrationFile = migrationFiles.find(file => file.startsWith(lastVersion));

      if (!migrationFile) {
        logger.warn(`Migration file not found for version ${lastVersion}`);
        return;
      }

      const migration = await this.loadMigration(migrationFile);
      if (!migration) {
        logger.warn(`Failed to load migration ${migrationFile} for rollback`);
        return;
      }

      logger.info(`Rolling back migration ${migration.version}: ${migration.description}`);
      try {
        await migration.down();
        await this.removeMigrationRecord(migration.version);
        logger.info(`Migration ${migration.version} rolled back successfully`);
      } catch (error) {
        logger.error(`Rollback of migration ${migration.version} failed`, { error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    } catch (error) {
      logger.error('Rollback process failed', { error: error instanceof Error ? error.stack : String(error) });
      throw error;
    }
  }

  /**
   * Get migration status
   */
  async getStatus(): Promise<{
    applied: string[];
    pending: string[];
    total: number;
  }> {
    const migrationFiles = await this.getMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();

    const pending = migrationFiles.filter(file => {
      const version = file.split('_')[0];
      return !appliedMigrations.includes(version);
    });

    return {
      applied: appliedMigrations,
      pending: pending.map(file => file.split('_')[0]),
      total: migrationFiles.length
    };
  }
}

export const migrationRunner = new MigrationRunner();
export default migrationRunner;

