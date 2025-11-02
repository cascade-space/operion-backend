import fs from 'fs/promises';
import path from 'path';
import env from '@/config/env';
import logger from '@/utils/logger';
import { compressImage, isImageBuffer } from '@/utils/imageCompression';

export interface IStorageService {
  upload(file: Buffer | string, filename: string, options?: UploadOptions): Promise<string>;
  delete(filePath: string): Promise<void>;
  getUrl(filePath: string): Promise<string>;
  exists(filePath: string): Promise<boolean>;
}

export interface UploadOptions {
  folder?: string;
  makePublic?: boolean;
}

/**
 * Local filesystem storage service (default)
 */
class LocalStorageService implements IStorageService {
  private basePath: string;

  constructor() {
    this.basePath = env.UPLOAD_PATH;
    this.ensureDirectoryExists(this.basePath);
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  async upload(file: Buffer | string, filename: string, options?: UploadOptions): Promise<string> {
    const folder = options?.folder || '';
    const uploadDir = path.join(this.basePath, folder);
    
    await this.ensureDirectoryExists(uploadDir);
    
    const filePath = path.join(uploadDir, filename);
    const fileBuffer = typeof file === 'string' ? Buffer.from(file, 'base64') : file;
    
    await fs.writeFile(filePath, fileBuffer);
    
    // Return relative path from basePath
    return path.join(folder, filename).replace(/\\/g, '/');
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, filePath);
    try {
      await fs.unlink(fullPath);
    } catch (error) {
      // File might not exist, ignore error
      logger.warn('Storage: Failed to delete file', { filePath, error: error instanceof Error ? error.message : String(error) });
    }
  }

  async getUrl(filePath: string): Promise<string> {
    const baseUrl = env.STORAGE_BASE_URL || '';
    if (baseUrl) {
      return `${baseUrl}/${filePath}`;
    }
    // Return relative path for local storage
    return `/uploads/${filePath}`;
  }

  async exists(filePath: string): Promise<boolean> {
    const fullPath = path.join(this.basePath, filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * AWS S3 storage service
 */
class S3StorageService implements IStorageService {
  private bucket: string;
  private region: string;
  private s3Client: any; // Will be S3Client from @aws-sdk/client-s3
  private initPromise: Promise<void> | null = null;
  private PutObjectCommand: any;
  private DeleteObjectCommand: any;
  private HeadObjectCommand: any;
  private GetObjectCommand: any;

  constructor() {
    this.bucket = env.AWS_S3_BUCKET || '';
    this.region = env.AWS_S3_REGION || 'us-east-1';
    
    if (!this.bucket) {
      throw new Error('AWS_S3_BUCKET is required when STORAGE_TYPE=s3');
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.s3Client) {
      return; // Already initialized
    }

    if (this.initPromise) {
      return this.initPromise; // Initialization in progress
    }

    this.initPromise = this.initializeS3Client();
    return this.initPromise;
  }

  private async initializeS3Client(): Promise<void> {
    try {
      const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } = await import('@aws-sdk/client-s3');
      
      this.s3Client = new S3Client({
        region: this.region,
        credentials: env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY ? {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        } : undefined, // Will use IAM role if credentials not provided
      });
      
      // Store commands for use in methods
      this.PutObjectCommand = PutObjectCommand;
      this.DeleteObjectCommand = DeleteObjectCommand;
      this.HeadObjectCommand = HeadObjectCommand;
    } catch (error) {
      logger.error('Failed to initialize S3 client. Make sure @aws-sdk/client-s3 is installed', { error: error instanceof Error ? error.message : String(error) });
      throw new Error('S3 client initialization failed. Install @aws-sdk/client-s3: npm install @aws-sdk/client-s3');
    }
  }

  async upload(file: Buffer | string, filename: string, options?: UploadOptions): Promise<string> {
    await this.ensureInitialized();

    try {
      let fileBuffer = typeof file === 'string' ? Buffer.from(file, 'base64') : file;
      
      // Compress images before upload
      if (isImageBuffer(fileBuffer)) {
        try {
          const originalSize = fileBuffer.length;
          fileBuffer = await compressImage(fileBuffer, {
            maxWidth: 1920,
            maxHeight: 1920,
            quality: 85,
            format: 'jpeg' // Convert all images to JPEG for consistency
          });
          
          // Update filename extension if format changed
          if (originalSize !== fileBuffer.length) {
            const ext = path.extname(filename).toLowerCase();
            if (['.png', '.gif', '.webp'].includes(ext)) {
              filename = filename.replace(ext, '.jpg');
            }
          }
          
          logger.debug('Image compressed before S3 upload', {
            filename,
            originalSize: `${(originalSize / 1024).toFixed(2)}KB`,
            compressedSize: `${(fileBuffer.length / 1024).toFixed(2)}KB`
          });
        } catch (compressionError) {
          logger.warn('Image compression failed, uploading original', {
            error: compressionError instanceof Error ? compressionError.message : String(compressionError)
          });
          // Continue with original buffer if compression fails
        }
      }

      const key = options?.folder ? `${options.folder}/${filename}` : filename;

      const command = new this.PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: this.getContentType(filename),
        CacheControl: 'max-age=31536000', // 1 year cache
        ...(options?.makePublic && { ACL: 'public-read' }),
      });

      await this.s3Client.send(command);

      // Return the S3 key (path)
      return key;
    } catch (error: any) {
      logger.error('S3 upload error', { error: error instanceof Error ? error.message : String(error), filename });
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  async delete(filePath: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const command = new this.DeleteObjectCommand({
        Bucket: this.bucket,
        Key: filePath,
      });

      await this.s3Client.send(command);
    } catch (error: any) {
      // Don't throw error if file doesn't exist
      logger.warn('S3 delete warning', { filePath, error: error instanceof Error ? error.message : String(error) });
    }
  }

  async getUrl(filePath: string): Promise<string> {
    // If STORAGE_BASE_URL is set (e.g., CloudFront CDN), use that
    if (env.STORAGE_BASE_URL) {
      return `${env.STORAGE_BASE_URL}/${filePath}`;
    }

    // Otherwise, return S3 public URL or presigned URL
    // For public buckets: https://bucket.s3.region.amazonaws.com/key
    // For private buckets, you'd need to generate presigned URLs
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${filePath}`;
  }

  async exists(filePath: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      const command = new this.HeadObjectCommand({
        Bucket: this.bucket,
        Key: filePath,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      // For other errors, log and return false
      logger.warn('S3 exists check error', { filePath, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  private getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.json': 'application/json',
    };
    return contentTypes[ext] || 'application/octet-stream';
  }
}

/**
 * Google Cloud Storage service
 */
class GCSStorageService implements IStorageService {
  private bucket: string;
  private projectId: string;
  private storageClient: any; // Will be Storage from @google-cloud/storage
  private bucketInstance: any;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.bucket = env.GCS_BUCKET || '';
    this.projectId = env.GCS_PROJECT_ID || '';
    
    if (!this.bucket) {
      throw new Error('GCS_BUCKET is required when STORAGE_TYPE=gcs');
    }
    if (!this.projectId) {
      throw new Error('GCS_PROJECT_ID is required when STORAGE_TYPE=gcs');
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.storageClient && this.bucketInstance) {
      return; // Already initialized
    }

    if (this.initPromise) {
      return this.initPromise; // Initialization in progress
    }

    this.initPromise = this.initializeGCSClient();
    return this.initPromise;
  }

  private async initializeGCSClient(): Promise<void> {
    try {
      const { Storage } = await import('@google-cloud/storage');
      
      // Initialize GCS client with credentials
      const storageOptions: any = {
        projectId: this.projectId,
      };

      // Use keyfile if provided, otherwise use GOOGLE_APPLICATION_CREDENTIALS
      if (env.GCS_KEYFILE) {
        storageOptions.keyFilename = env.GCS_KEYFILE;
      }

      this.storageClient = new Storage(storageOptions);
      this.bucketInstance = this.storageClient.bucket(this.bucket);
      
      // Verify bucket exists and is accessible
      const [exists] = await this.bucketInstance.exists();
      if (!exists) {
        throw new Error(`GCS bucket ${this.bucket} does not exist or is not accessible`);
      }

      logger.info('GCS Storage initialized', { bucket: this.bucket, project: this.projectId });
    } catch (error: any) {
      logger.error('Failed to initialize GCS client', { error: error instanceof Error ? error.message : String(error) });
      throw new Error(`GCS client initialization failed: ${error.message}. Install @google-cloud/storage: npm install @google-cloud/storage`);
    }
  }

  private getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.json': 'application/json',
    };
    return contentTypes[ext] || 'application/octet-stream';
  }

  async upload(file: Buffer | string, filename: string, options?: UploadOptions): Promise<string> {
    await this.ensureInitialized();

    try {
      const fileBuffer = typeof file === 'string' ? Buffer.from(file, 'base64') : file;
      const key = options?.folder ? `${options.folder}/${filename}` : filename;
      const contentType = this.getContentType(filename);

      const fileInstance = this.bucketInstance.file(key);
      
      const uploadOptions: any = {
        metadata: {
          contentType,
        },
      };

      // If public access is requested
      if (options?.makePublic) {
        uploadOptions.predefinedAcl = 'publicRead';
      }

      await fileInstance.save(fileBuffer, uploadOptions);

      // Make file public if requested (separate call for better control)
      if (options?.makePublic) {
        await fileInstance.makePublic();
      }

      // Return the GCS key (path)
      return key;
    } catch (error: any) {
      logger.error('GCS upload error', { error: error instanceof Error ? error.message : String(error), filename });
      throw new Error(`Failed to upload file to GCS: ${error.message}`);
    }
  }

  async delete(filePath: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const fileInstance = this.bucketInstance.file(filePath);
      const [exists] = await fileInstance.exists();
      
      if (exists) {
        await fileInstance.delete();
      }
    } catch (error: any) {
      // Don't throw error if file doesn't exist
      logger.warn('GCS delete warning', { filePath, error: error instanceof Error ? error.message : String(error) });
    }
  }

  async getUrl(filePath: string): Promise<string> {
    // If STORAGE_BASE_URL is set (e.g., CDN), use that
    if (env.STORAGE_BASE_URL) {
      return `${env.STORAGE_BASE_URL}/${filePath}`;
    }

    // Return GCS public URL
    // Format: https://storage.googleapis.com/bucket-name/file-path
    // Or: https://bucket-name.storage.googleapis.com/file-path
    const encodedBucket = encodeURIComponent(this.bucket);
    const encodedPath = encodeURIComponent(filePath).replace(/%2F/g, '/');
    return `https://storage.googleapis.com/${encodedBucket}/${encodedPath}`;
  }

  async exists(filePath: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      const fileInstance = this.bucketInstance.file(filePath);
      const [exists] = await fileInstance.exists();
      return exists;
    } catch (error: any) {
      logger.warn('GCS exists check error', { filePath, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
}

/**
 * Factory function to get the appropriate storage service
 */
export const getStorageService = (): IStorageService => {
  const storageType = env.STORAGE_TYPE;

  switch (storageType) {
    case 's3':
      return new S3StorageService();
    case 'gcs':
      return new GCSStorageService();
    case 'local':
    default:
      return new LocalStorageService();
  }
};

// Export singleton instance
export const storageService = getStorageService();
export default storageService;

