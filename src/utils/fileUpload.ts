import { Request } from 'express';
import path from 'path';
import fs from 'fs';
import { ApiResponse } from '@/types';
import storageService from '@/services/storageService';
import env from '@/config/env';
import logger from '@/utils/logger';

export interface UploadedFile {
  name: string;
  data: Buffer;
  size: number;
  mimetype: string;
  mv: (path: string) => Promise<void>;
}

export interface FileUploadRequest extends Request {
  files?: any;
}

/**
 * Check available disk space (for local storage)
 * @param uploadPath - Path where file will be uploaded
 * @param requiredBytes - Required bytes for upload
 * @returns true if sufficient space available
 */
async function checkStorageQuota(uploadPath: string, requiredBytes: number): Promise<{ available: boolean; error?: string }> {
  // Only check quota for local storage
  if (env.STORAGE_TYPE !== 'local') {
    return { available: true }; // Cloud storage handles quotas
  }

  try {
    const stats = fs.statSync(uploadPath);
    if (!stats.isDirectory()) {
      // If path doesn't exist, create it
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    // Check available space (Node.js doesn't have direct API, but we can try to write)
    // For now, we'll assume space is available and let the OS handle it
    // In production, use a library like 'check-disk-space' or system commands
    return { available: true };
  } catch (error: any) {
    if (error.code === 'ENOSPC') {
      return { available: false, error: 'Insufficient disk space' };
    }
    // If directory doesn't exist, create it
    try {
      fs.mkdirSync(uploadPath, { recursive: true });
      return { available: true };
    } catch (mkdirError) {
      return { available: false, error: 'Cannot create upload directory' };
    }
  }
}

/**
 * Retry file upload with exponential backoff
 * @param uploadFn - Upload function to retry
 * @param maxRetries - Maximum number of retries
 * @returns Upload result
 */
async function retryUpload<T>(
  uploadFn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await uploadFn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      logger.warn(`Upload attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
        error: lastError.message,
        attempt: attempt + 1,
        maxRetries
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error('Upload failed after retries');
}

/**
 * Clean up partial uploads on failure
 * @param filePath - Path to file to clean up
 */
async function cleanupPartialUpload(filePath: string): Promise<void> {
  try {
    if (env.STORAGE_TYPE === 'local' && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.debug('Cleaned up partial upload', { filePath });
    } else if (env.STORAGE_TYPE !== 'local') {
      // For cloud storage, try to delete the file
      try {
        await storageService.delete(filePath);
        logger.debug('Cleaned up partial cloud upload', { filePath });
      } catch (error) {
        // Ignore cleanup errors for cloud storage
        logger.debug('Could not clean up cloud upload (may not exist)', { filePath });
      }
    }
  } catch (error) {
    logger.warn('Failed to cleanup partial upload', {
      filePath,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export interface UploadedFile {
  name: string;
  data: Buffer;
  size: number;
  mimetype: string;
  mv: (path: string) => Promise<void>;
}

export interface FileUploadRequest extends Request {
  files?: any;
}

export const validateFileUpload = (
  req: FileUploadRequest,
  allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
  maxSize: number = 5 * 1024 * 1024 // 5MB default
): { success: boolean; error?: string; file?: UploadedFile } => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return { success: false, error: 'No files were uploaded' };
  }

  const file = req.files.file as UploadedFile;
  if (!file) {
    return { success: false, error: 'No file field found' };
  }

  // Check file size
  if (file.size > maxSize) {
    return { success: false, error: `File size exceeds ${maxSize / (1024 * 1024)}MB limit` };
  }

  // Check file type
  if (!allowedTypes.includes(file.mimetype)) {
    return { success: false, error: `File type ${file.mimetype} is not allowed` };
  }

  return { success: true, file };
};

export const saveFile = async (
  file: UploadedFile,
  uploadPath: string,
  fileName?: string
): Promise<{ success: boolean; filePath?: string; fileUrl?: string; error?: string }> => {
  let finalPath: string | undefined;
  
  try {
    // Check storage quota before upload
    const quotaCheck = await checkStorageQuota(uploadPath, file.size);
    if (!quotaCheck.available) {
      return { success: false, error: quotaCheck.error || 'Insufficient storage space' };
    }

    // Generate unique filename if not provided
    const finalFileName = fileName || `${Date.now()}-${file.name}`;
    
    // If using cloud storage (S3/GCS), upload with retry logic
    if (env.STORAGE_TYPE === 's3' || env.STORAGE_TYPE === 'gcs') {
      // Determine folder from uploadPath
      const folder = uploadPath.replace(/^\.\/uploads\/?/, '').replace(/^uploads\/?/, '');
      
      try {
        // Upload to cloud storage with retry logic
        const cloudPath = await retryUpload(async () => {
          return await storageService.upload(file.data, finalFileName, {
            folder: folder || undefined,
            makePublic: true // Make files publicly accessible
          });
        }, 3);
        
        // Get public URL
        const fileUrl = await storageService.getUrl(cloudPath);
        
        return { success: true, filePath: cloudPath, fileUrl };
      } catch (error: any) {
        logger.error('Cloud storage upload failed after retries', {
          error: error.message,
          fileName: finalFileName,
          folder
        });
        return { success: false, error: 'File upload failed. Please try again.' };
      }
    }
    
    // Local storage with retry logic
    const uploadDir = path.dirname(uploadPath);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    finalPath = path.join(uploadPath, finalFileName);

    try {
      // Move file to destination with retry logic
      await retryUpload(async () => {
        await file.mv(finalPath!);
      }, 3);

      return { success: true, filePath: finalPath };
    } catch (error: any) {
      // Clean up partial upload on failure
      await cleanupPartialUpload(finalPath);
      logger.error('Local file upload failed after retries', {
        error: error.message,
        filePath: finalPath
      });
      return { success: false, error: 'File upload failed. Please try again.' };
    }
  } catch (error: any) {
    // Clean up partial upload on failure
    if (finalPath) {
      await cleanupPartialUpload(finalPath);
    }
    logger.error('File upload error', {
      error: error.message,
      filePath: finalPath
    });
    return { success: false, error: error.message || 'File upload failed' };
  }
};

export const deleteFile = async (filePath: string): Promise<boolean> => {
  try {
    // If using cloud storage, use storage service
    if (env.STORAGE_TYPE === 's3' || env.STORAGE_TYPE === 'gcs') {
      // Remove /uploads/ prefix if present (legacy local paths)
      const cleanPath = filePath.replace(/^\/uploads\//, '').replace(/^uploads\//, '');
      await storageService.delete(cleanPath);
      return true;
    }
    
    // Local storage fallback
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

export const getFileExtension = (fileName: string): string => {
  return path.extname(fileName).toLowerCase();
};

export const sanitizeFileName = (fileName: string): string => {
  return fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
};

// Middleware for handling file uploads
export const handleFileUpload = (
  allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
  maxSize: number = 5 * 1024 * 1024
) => {
  return (req: FileUploadRequest, res: any, next: any) => {
    const validation = validateFileUpload(req, allowedTypes, maxSize);
    
    if (!validation.success) {
      const response: ApiResponse = {
        success: false,
        error: validation.error || 'File upload validation failed',
        status: 400
      };
      return res.status(400).json(response);
    }

    // Add validated file to request object
    (req as any).validatedFile = validation.file;
    next();
  };
};
