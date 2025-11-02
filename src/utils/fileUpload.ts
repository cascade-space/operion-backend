import { Request } from 'express';
import path from 'path';
import fs from 'fs';
import { ApiResponse } from '@/types';
import storageService from '@/services/storageService';
import env from '@/config/env';

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
  try {
    // Generate unique filename if not provided
    const finalFileName = fileName || `${Date.now()}-${file.name}`;
    
    // If using cloud storage (S3/GCS), upload directly
    if (env.STORAGE_TYPE === 's3' || env.STORAGE_TYPE === 'gcs') {
      // Determine folder from uploadPath
      const folder = uploadPath.replace(/^\.\/uploads\/?/, '').replace(/^uploads\/?/, '');
      
      // Upload to cloud storage
      const cloudPath = await storageService.upload(file.data, finalFileName, {
        folder: folder || undefined,
        makePublic: true // Make files publicly accessible
      });
      
      // Get public URL
      const fileUrl = await storageService.getUrl(cloudPath);
      
      return { success: true, filePath: cloudPath, fileUrl };
    }
    
    // Local storage fallback
    const uploadDir = path.dirname(uploadPath);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const finalPath = path.join(uploadPath, finalFileName);

    // Move file to destination
    await file.mv(finalPath);

    return { success: true, filePath: finalPath };
  } catch (error: any) {
    return { success: false, error: error.message };
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
