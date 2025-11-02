import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import env from '@/config/env';
import logger from '@/utils/logger';

const execAsync = promisify(exec);

interface BackupConfig {
  retentionDays: number;
  backupDir: string;
  s3Bucket?: string;
  s3Region?: string;
}

/**
 * Database backup service with S3 storage support
 */
class DatabaseBackup {
  private config: BackupConfig;
  private s3Client: any;
  private PutObjectCommand: any;

  constructor() {
    this.config = {
      retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30'),
      backupDir: process.env.BACKUP_DIR || './backups',
      s3Bucket: process.env.BACKUP_S3_BUCKET,
      s3Region: process.env.BACKUP_S3_REGION || process.env.AWS_S3_REGION || 'us-east-1'
    };
  }

  /**
   * Create a MongoDB backup and optionally upload to S3
   */
  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // Remove milliseconds
    const backupFilename = `operion-backup-${timestamp}.gz`;
    const backupPath = path.join(this.config.backupDir, backupFilename);

    // Ensure backup directory exists
    if (!fs.existsSync(this.config.backupDir)) {
      fs.mkdirSync(this.config.backupDir, { recursive: true });
      logger.info('Created backup directory', { path: this.config.backupDir });
    }

    try {
      // Get MongoDB URI from environment
      const mongoUri = env.NODE_ENV === 'production' 
        ? (env.MONGODB_URI_PROD || env.MONGODB_URI)
        : env.MONGODB_URI;

      if (!mongoUri) {
        throw new Error('MongoDB URI is not configured');
      }

      logger.info('Starting database backup', { timestamp, backupPath });

      // Create MongoDB backup using mongodump
      // Note: mongodump must be installed and available in PATH
      const { stdout, stderr } = await execAsync(
        `mongodump --uri="${mongoUri}" --archive="${backupPath}" --gzip`
      );

      // Check if backup file was created
      if (!fs.existsSync(backupPath)) {
        throw new Error('Backup file was not created');
      }

      const stats = fs.statSync(backupPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      logger.info('Backup created successfully', { 
        path: backupPath, 
        size: `${fileSizeMB}MB`,
        timestamp 
      });

      // Upload to S3 if configured
      if (this.config.s3Bucket) {
        await this.uploadToS3(backupPath, backupFilename);
      }

      // Clean old backups
      await this.cleanOldBackups();

      return backupPath;
    } catch (error) {
      logger.error('Backup failed', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Clean up failed backup file if it exists
      if (fs.existsSync(backupPath)) {
        try {
          fs.unlinkSync(backupPath);
        } catch (cleanupError) {
          logger.warn('Failed to cleanup backup file', { backupPath });
        }
      }
      
      throw error;
    }
  }

  /**
   * Upload backup to AWS S3
   */
  private async uploadToS3(filePath: string, filename: string): Promise<void> {
    try {
      await this.ensureS3Initialized();

      const fileContent = fs.readFileSync(filePath);
      const s3Key = `backups/${filename}`;

      const command = new this.PutObjectCommand({
        Bucket: this.config.s3Bucket!,
        Key: s3Key,
        Body: fileContent,
        ServerSideEncryption: 'AES256',
        StorageClass: 'STANDARD_IA', // Infrequent Access for cost savings
        Metadata: {
          'backup-date': new Date().toISOString(),
          'source': 'operion-backup-script'
        }
      });

      await this.s3Client.send(command);

      const fileSizeMB = (fileContent.length / (1024 * 1024)).toFixed(2);
      logger.info('Backup uploaded to S3', { 
        bucket: this.config.s3Bucket, 
        key: s3Key,
        size: `${fileSizeMB}MB`
      });
    } catch (error) {
      logger.error('Failed to upload backup to S3', { 
        error: error instanceof Error ? error.message : String(error),
        bucket: this.config.s3Bucket 
      });
      // Don't throw - backup exists locally even if S3 upload fails
    }
  }

  /**
   * Initialize S3 client if not already initialized
   */
  private async ensureS3Initialized(): Promise<void> {
    if (this.s3Client) {
      return;
    }

    try {
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      
      this.s3Client = new S3Client({
        region: this.config.s3Region,
        credentials: env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY ? {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        } : undefined, // Will use IAM role if credentials not provided
      });

      this.PutObjectCommand = PutObjectCommand;
    } catch (error) {
      throw new Error(`Failed to initialize S3 client: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clean old backup files based on retention policy
   */
  private async cleanOldBackups(): Promise<void> {
    try {
      if (!fs.existsSync(this.config.backupDir)) {
        return;
      }

      const files = fs.readdirSync(this.config.backupDir);
      const now = Date.now();
      const retentionMs = this.config.retentionDays * 24 * 60 * 60 * 1000;
      let deletedCount = 0;

      for (const file of files) {
        // Only process backup files
        if (!file.startsWith('operion-backup-') || !file.endsWith('.gz')) {
          continue;
        }

        const filePath = path.join(this.config.backupDir, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtimeMs > retentionMs) {
          fs.unlinkSync(filePath);
          deletedCount++;
          logger.info('Deleted old backup', { file });
        }
      }

      if (deletedCount > 0) {
        logger.info('Cleaned old backups', { deletedCount });
      }

      // Also clean from S3 if configured
      if (this.config.s3Bucket) {
        await this.cleanOldS3Backups();
      }
    } catch (error) {
      logger.warn('Failed to clean old backups', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Clean old backups from S3
   */
  private async cleanOldS3Backups(): Promise<void> {
    try {
      await this.ensureS3Initialized();

      const { ListObjectsV2Command, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      
      const listCommand = new ListObjectsV2Command({
        Bucket: this.config.s3Bucket!,
        Prefix: 'backups/operion-backup-'
      });

      const response = await this.s3Client.send(listCommand);
      
      if (!response.Contents || response.Contents.length === 0) {
        return;
      }

      const now = Date.now();
      const retentionMs = this.config.retentionDays * 24 * 60 * 60 * 1000;
      let deletedCount = 0;

      for (const object of response.Contents) {
        if (!object.Key || !object.LastModified) {
          continue;
        }

        const lastModified = object.LastModified.getTime();
        if (now - lastModified > retentionMs) {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: this.config.s3Bucket!,
            Key: object.Key
          });
          
          await this.s3Client.send(deleteCommand);
          deletedCount++;
          logger.info('Deleted old S3 backup', { key: object.Key });
        }
      }

      if (deletedCount > 0) {
        logger.info('Cleaned old S3 backups', { deletedCount });
      }
    } catch (error) {
      logger.warn('Failed to clean old S3 backups', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Restore database from backup
   */
  async restoreBackup(backupPath: string): Promise<void> {
    try {
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      const mongoUri = env.NODE_ENV === 'production' 
        ? (env.MONGODB_URI_PROD || env.MONGODB_URI)
        : env.MONGODB_URI;

      if (!mongoUri) {
        throw new Error('MongoDB URI is not configured');
      }

      logger.warn('Restoring database from backup', { backupPath, mongoUri });
      
      // Note: This will overwrite the existing database
      // In production, you might want to add confirmation prompts
      const { stdout, stderr } = await execAsync(
        `mongorestore --uri="${mongoUri}" --archive="${backupPath}" --gzip --drop`
      );

      logger.info('Database restored successfully', { backupPath });
    } catch (error) {
      logger.error('Database restore failed', { 
        error: error instanceof Error ? error.message : String(error),
        backupPath
      });
      throw error;
    }
  }
}

// Run if called directly (check if this file is being executed directly)
const isMainModule = process.argv[1]?.endsWith('backup-database.ts') || 
                     process.argv[1]?.includes('backup-database');

if (isMainModule) {
  const backup = new DatabaseBackup();
  
  // Check for restore flag
  const restoreFlag = process.argv.includes('--restore');
  const restorePath = process.argv[process.argv.indexOf('--restore') + 1];
  
  if (restoreFlag && restorePath) {
    backup.restoreBackup(restorePath)
      .then(() => {
        logger.info('Database restored successfully', { path: restorePath });
        process.exit(0);
      })
      .catch(error => {
        logger.error('Restore failed', { error: error instanceof Error ? error.message : String(error) });
        process.exit(1);
      });
  } else {
    backup.createBackup()
      .then(path => {
        logger.info('Backup completed successfully', { path });
        process.exit(0);
      })
      .catch(error => {
        logger.error('Backup script failed', { error: error instanceof Error ? error.message : String(error) });
        process.exit(1);
      });
  }
}

export default DatabaseBackup;

