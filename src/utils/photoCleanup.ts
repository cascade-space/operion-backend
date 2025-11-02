import fs from 'fs';
import path from 'path';
import WorkEntry from '@/models/WorkEntry';
import { deleteFile } from './fileUpload';
import storageService from '@/services/storageService';
import env from '@/config/env';

export interface PhotoCleanupResult {
  totalPhotosChecked: number;
  photosDeleted: number;
  errors: string[];
  executionTime: number;
}

/**
 * Cleanup photos older than 1 week from work entries
 * This function will:
 * 1. Find all work entries with photos older than 7 days
 * 2. Delete the photo files from the filesystem
 * 3. Update the work entry to remove the photo reference
 */
export const cleanupOldPhotos = async (): Promise<PhotoCleanupResult> => {
  const startTime = Date.now();
  const result: PhotoCleanupResult = {
    totalPhotosChecked: 0,
    photosDeleted: 0,
    errors: [],
    executionTime: 0
  };

  try {
    console.log('🧹 Starting photo cleanup process...');

    // Calculate the cutoff date (7 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    console.log(`📅 Cleaning up photos older than: ${cutoffDate.toISOString()}`);

    // Find all work entries with photos older than 7 days
    // Exclude null, undefined, and empty strings
    const oldWorkEntries = await WorkEntry.find({
      photo: { $exists: true, $ne: null, $nin: [null, ''] },
      createdAt: { $lt: cutoffDate }
    });

    result.totalPhotosChecked = oldWorkEntries.length;
    console.log(`📊 Found ${oldWorkEntries.length} work entries with old photos`);

    // Process each work entry
    for (const workEntry of oldWorkEntries) {
      try {
        if (!workEntry.photo) {
          continue;
        }

        // Detect photo type and handle deletion accordingly
        const photoInfo = extractPhotoInfo(workEntry.photo);
        
        if (photoInfo.type === 'base64') {
          // Base64 photos are stored directly in DB, just remove the field
          console.log(`🗑️ Removing base64 photo from work entry ${workEntry._id}`);
          result.photosDeleted++;
        } else if (photoInfo.type === 'cloud') {
          // Cloud storage (S3/GCS) - use storageService
          try {
            await storageService.delete(photoInfo.path);
            console.log(`✅ Deleted cloud photo: ${photoInfo.path}`);
            result.photosDeleted++;
          } catch (error: any) {
            const errorMsg = `Failed to delete cloud photo ${photoInfo.path}: ${error.message}`;
            console.error(errorMsg);
            result.errors.push(errorMsg);
            // Still count as deleted and remove from DB even if file deletion fails
            result.photosDeleted++;
          }
        } else if (photoInfo.type === 'local') {
          // Local file storage - use deleteFile utility
          try {
            const deleted = await deleteFile(photoInfo.path);
            if (deleted) {
              console.log(`✅ Deleted local photo file: ${photoInfo.path}`);
              result.photosDeleted++;
            } else {
              console.log(`⚠️ Photo file not found or already deleted: ${photoInfo.path}`);
              // Still count as deleted since it's not accessible
              result.photosDeleted++;
            }
          } catch (error: any) {
            const errorMsg = `Failed to delete local photo ${photoInfo.path}: ${error.message}`;
            console.error(errorMsg);
            result.errors.push(errorMsg);
            // Still count as deleted and remove from DB even if file deletion fails
            result.photosDeleted++;
          }
        } else {
          // Unknown format - log warning but still remove from DB
          console.log(`⚠️ Unknown photo format, removing from DB: ${workEntry.photo.substring(0, 50)}...`);
          result.photosDeleted++;
        }

        // Update work entry to remove photo reference (always done regardless of deletion result)
        await WorkEntry.findByIdAndUpdate(workEntry._id, {
          $unset: { photo: 1 }
        });

        console.log(`✅ Updated work entry ${workEntry._id} - removed photo reference`);

      } catch (error: any) {
        const errorMsg = `Error processing work entry ${workEntry._id}: ${error.message}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    result.executionTime = Date.now() - startTime;
    
    console.log(`✅ Photo cleanup completed in ${result.executionTime}ms`);
    console.log(`📊 Summary: ${result.photosDeleted}/${result.totalPhotosChecked} photos deleted`);
    
    if (result.errors.length > 0) {
      console.log(`⚠️ ${result.errors.length} errors occurred during cleanup`);
    }

    return result;

  } catch (error: any) {
    result.executionTime = Date.now() - startTime;
    const errorMsg = `Photo cleanup failed: ${error.message}`;
    console.error(errorMsg);
    result.errors.push(errorMsg);
    return result;
  }
};

/**
 * Photo information extracted from photo string
 */
interface PhotoInfo {
  type: 'base64' | 'cloud' | 'local' | 'unknown';
  path: string;
}

/**
 * Extract photo information and determine storage type
 * Handles different photo storage formats:
 * - Base64 data URLs: data:image/jpeg;base64,...
 * - Cloud storage URLs: https://s3.amazonaws.com/bucket/..., https://storage.googleapis.com/...
 * - Cloud storage paths: photos/work-123.jpg, work-entries/photo.jpg
 * - Local file paths: /uploads/photos/..., uploads/work-123.jpg
 * - HTTP URLs: http://localhost:3000/uploads/photos/...
 */
const extractPhotoInfo = (photoString: string): PhotoInfo => {
  try {
    // Check for base64 data URL
    if (photoString.startsWith('data:')) {
      return { type: 'base64', path: '' };
    }

    // Check for cloud storage URLs (S3, GCS, CloudFront, etc.)
    if (photoString.startsWith('http://') || photoString.startsWith('https://')) {
      try {
        const url = new URL(photoString);
        
        // AWS S3 URL patterns
        if (url.hostname.includes('s3') || url.hostname.includes('amazonaws.com')) {
          // Extract key from URL (path after bucket name)
          // Format: https://bucket.s3.region.amazonaws.com/key or https://s3.region.amazonaws.com/bucket/key
          const pathParts = url.pathname.split('/').filter(p => p);
          if (pathParts.length > 1) {
            // Skip bucket name, get the rest as key
            const key = pathParts.slice(1).join('/');
            return { type: 'cloud', path: key };
          }
          return { type: 'cloud', path: url.pathname.substring(1) }; // Remove leading /
        }
        
        // Google Cloud Storage URL patterns
        if (url.hostname.includes('storage.googleapis.com') || url.hostname.includes('storage.cloud.google.com')) {
          // Extract key from URL
          const pathParts = url.pathname.split('/').filter(p => p);
          if (pathParts.length > 1) {
            // Skip bucket name, get the rest as key
            const key = pathParts.slice(1).join('/');
            return { type: 'cloud', path: key };
          }
          return { type: 'cloud', path: url.pathname.substring(1) };
        }
        
        // CloudFront or CDN URLs - try to extract path
        if (url.hostname.includes('cloudfront.net') || url.hostname.includes('cdn.')) {
          return { type: 'cloud', path: url.pathname.substring(1) };
        }
        
        // Generic HTTP/HTTPS URL - assume local server or extract path
        // If it's pointing to localhost or our server, it's a local file
        if (url.hostname === 'localhost' || url.hostname.includes('127.0.0.1')) {
          return { type: 'local', path: url.pathname };
        }
        
        // Unknown URL format - treat as cloud storage path
        return { type: 'cloud', path: url.pathname.substring(1) };
      } catch (urlError) {
        // Invalid URL format
        console.warn('Invalid URL format:', photoString);
        return { type: 'unknown', path: photoString };
      }
    }

    // Check if using cloud storage based on env config
    if (env.STORAGE_TYPE === 's3' || env.STORAGE_TYPE === 'gcs') {
      // If storage is cloud, paths without /uploads/ are likely cloud keys
      if (!photoString.startsWith('/uploads/') && !photoString.startsWith('./uploads/')) {
        // This is likely a cloud storage key
        return { type: 'cloud', path: photoString };
      }
    }

    // Local file paths
    if (photoString.startsWith('/uploads/') || photoString.startsWith('./uploads/') || photoString.startsWith('uploads/')) {
      // Clean up the path
      let cleanPath = photoString.replace(/^\.\/uploads\//, 'uploads/').replace(/^\/uploads\//, 'uploads/');
      return { type: 'local', path: cleanPath };
    }

    // If it's a filename only (no slashes), determine based on storage type
    if (!photoString.includes('/')) {
      if (env.STORAGE_TYPE === 's3' || env.STORAGE_TYPE === 'gcs') {
        return { type: 'cloud', path: photoString };
      }
      return { type: 'local', path: `uploads/photos/${photoString}` };
    }

    // Unknown format
    return { type: 'unknown', path: photoString };

  } catch (error) {
    console.error('Error extracting photo info:', error);
    return { type: 'unknown', path: photoString };
  }
};

/**
 * Get cleanup statistics for monitoring
 */
export const getCleanupStats = async (): Promise<{
  totalPhotos: number;
  oldPhotos: number;
  cutoffDate: Date;
}> => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);

  const totalPhotos = await WorkEntry.countDocuments({
    photo: { $exists: true, $ne: null, $nin: [null, ''] }
  });

  const oldPhotos = await WorkEntry.countDocuments({
    photo: { $exists: true, $ne: null, $nin: [null, ''] },
    createdAt: { $lt: cutoffDate }
  });

  return {
    totalPhotos,
    oldPhotos,
    cutoffDate
  };
};

/**
 * Manual cleanup function for testing or immediate execution
 */
export const manualPhotoCleanup = async (): Promise<PhotoCleanupResult> => {
  console.log('🔧 Manual photo cleanup initiated...');
  return await cleanupOldPhotos();
};
