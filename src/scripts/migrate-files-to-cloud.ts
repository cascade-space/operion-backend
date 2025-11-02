/**
 * Migration script to move files from local storage to cloud storage (S3/GCS)
 * 
 * Usage:
 *   tsx src/scripts/migrate-files-to-cloud.ts --source local --destination s3
 *   tsx src/scripts/migrate-files-to-cloud.ts --source local --destination gcs
 * 
 * Prerequisites:
 *   - Source files exist in ./uploads directory
 *   - STORAGE_TYPE environment variable set to destination type
 *   - Cloud storage credentials configured
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import { connectDB } from '@/config/database';
import storageService from '@/services/storageService';
import env from '@/config/env';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface MigrationStats {
  total: number;
  migrated: number;
  failed: number;
  skipped: number;
  errors: Array<{ file: string; error: string }>;
}

async function getAllFiles(dir: string, fileList: string[] = []): Promise<string[]> {
  const files = await fs.readdir(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);
    
    if (stat.isDirectory()) {
      await getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

async function migrateFile(localPath: string, uploadsBasePath: string): Promise<{ success: boolean; cloudPath?: string; error?: string }> {
  try {
    // Read file
    const fileBuffer = await fs.readFile(localPath);
    
    // Get relative path from uploads base
    const relativePath = path.relative(uploadsBasePath, localPath);
    
    // Determine folder structure
    const fileName = path.basename(relativePath);
    const folder = path.dirname(relativePath);
    
    // Upload to cloud storage
    const cloudPath = await storageService.upload(fileBuffer, fileName, {
      folder: folder !== '.' ? folder : undefined,
      makePublic: true
    });
    
    return { success: true, cloudPath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function updateDatabaseReferences(oldPath: string, newPath: string): Promise<void> {
  // This would update database records that reference the old path
  // Implementation depends on your data models
  // For now, we'll just log what needs to be updated
  console.log(`  Database update needed: "${oldPath}" -> "${newPath}"`);
  
  // Example: If you have models that store file paths, update them here
  // await WorkEntry.updateMany(
  //   { photo: oldPath },
  //   { $set: { photo: newPath } }
  // );
}

async function migrateFiles(): Promise<void> {
  try {
    // Load environment variables
    dotenv.config();
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const sourceArg = args.find(arg => arg.startsWith('--source='));
    const destinationArg = args.find(arg => arg.startsWith('--destination='));
    
    const source = sourceArg?.split('=')[1] || 'local';
    const destination = destinationArg?.split('=')[1] || env.STORAGE_TYPE;
    
    if (source !== 'local') {
      console.error('❌ Source must be "local". Migration from other sources not yet implemented.');
      process.exit(1);
    }
    
    if (!['s3', 'gcs'].includes(destination)) {
      console.error('❌ Destination must be "s3" or "gcs".');
      process.exit(1);
    }
    
    console.log('🚀 Starting file migration...');
    console.log(`   Source: ${source} (local filesystem)`);
    console.log(`   Destination: ${destination} (${destination === 's3' ? 'AWS S3' : 'Google Cloud Storage'})`);
    console.log('');
    
    // Validate cloud storage configuration
    if (destination === 's3') {
      if (!env.AWS_S3_BUCKET) {
        console.error('❌ AWS_S3_BUCKET is required for S3 migration');
        process.exit(1);
      }
      console.log(`   S3 Bucket: ${env.AWS_S3_BUCKET}`);
    } else if (destination === 'gcs') {
      if (!env.GCS_BUCKET) {
        console.error('❌ GCS_BUCKET is required for GCS migration');
        process.exit(1);
      }
      console.log(`   GCS Bucket: ${env.GCS_BUCKET}`);
    }
    
    // Connect to database (for updating references)
    try {
      await connectDB();
      console.log('✅ Database connected');
    } catch (error) {
      console.warn('⚠️  Database connection failed, continuing without database updates');
    }
    
    // Find uploads directory
    const uploadsPath = path.join(process.cwd(), 'uploads');
    
    try {
      await fs.access(uploadsPath);
    } catch {
      console.error(`❌ Uploads directory not found: ${uploadsPath}`);
      process.exit(1);
    }
    
    console.log(`   Uploads directory: ${uploadsPath}`);
    console.log('');
    
    // Get all files
    console.log('📂 Scanning files...');
    const allFiles = await getAllFiles(uploadsPath);
    console.log(`   Found ${allFiles.length} files`);
    console.log('');
    
    if (allFiles.length === 0) {
      console.log('✅ No files to migrate');
      return;
    }
    
    // Migrate files
    const stats: MigrationStats = {
      total: allFiles.length,
      migrated: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };
    
    console.log('📤 Migrating files...');
    
    for (let i = 0; i < allFiles.length; i++) {
      const filePath = allFiles[i];
      const relativePath = path.relative(uploadsPath, filePath);
      
      process.stdout.write(`   [${i + 1}/${allFiles.length}] ${relativePath}... `);
      
      // Check if file already exists in cloud (skip if exists)
      const relativePathClean = relativePath.replace(/\\/g, '/');
      const exists = await storageService.exists(relativePathClean);
      
      if (exists) {
        console.log('⏭️  skipped (already exists)');
        stats.skipped++;
        continue;
      }
      
      // Migrate file
      const result = await migrateFile(filePath, uploadsPath);
      
      if (result.success && result.cloudPath) {
        console.log('✅ migrated');
        stats.migrated++;
        
        // Get cloud URL
        const cloudUrl = await storageService.getUrl(result.cloudPath);
        console.log(`      → ${cloudUrl}`);
        
        // Update database references if needed
        const localRelativePath = `/uploads/${relativePathClean}`;
        await updateDatabaseReferences(localRelativePath, cloudUrl);
      } else {
        console.log(`❌ failed: ${result.error}`);
        stats.failed++;
        stats.errors.push({
          file: relativePath,
          error: result.error || 'Unknown error'
        });
      }
    }
    
    console.log('');
    console.log('📊 Migration Summary:');
    console.log(`   Total files: ${stats.total}`);
    console.log(`   ✅ Migrated: ${stats.migrated}`);
    console.log(`   ⏭️  Skipped: ${stats.skipped}`);
    console.log(`   ❌ Failed: ${stats.failed}`);
    
    if (stats.errors.length > 0) {
      console.log('');
      console.log('❌ Errors:');
      stats.errors.forEach(({ file, error }) => {
        console.log(`   - ${file}: ${error}`);
      });
    }
    
    if (stats.failed === 0) {
      console.log('');
      console.log('✅ Migration completed successfully!');
      console.log('');
      console.log('⚠️  Next steps:');
      console.log('   1. Verify files are accessible via cloud URLs');
      console.log('   2. Update database records that reference old local paths');
      console.log('   3. Set STORAGE_TYPE environment variable to:', destination);
      console.log('   4. Remove local uploads directory if migration verified');
    } else {
      console.log('');
      console.log('⚠️  Migration completed with errors. Please review and retry failed files.');
    }
    
    process.exit(stats.failed === 0 ? 0 : 1);
  } catch (error: any) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateFiles();

