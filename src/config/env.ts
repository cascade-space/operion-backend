import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  // Server Configuration
  PORT: number;
  WS_PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  LOG_LEVEL: string;
  
  // MongoDB Configuration
  MONGODB_URI: string;
  MONGODB_URI_PROD?: string;
  
  // Redis Configuration (Optional)
  REDIS_URL?: string;
  REDIS_HOST?: string;
  REDIS_PORT?: number;
  REDIS_PASSWORD?: string;
  REDIS_CLUSTER_MODE?: boolean;
  REDIS_REQUIRED?: boolean;
  
  // JWT Configuration (Required)
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  
  // Caching Configuration
  CACHE_DEFAULT_TTL: number;
  CACHE_ENABLED: boolean;
  
  // Email Configuration (Optional for development)
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  
  // File Upload Configuration
  UPLOAD_PATH: string;
  MAX_FILE_SIZE: number;
  STORAGE_TYPE: 'local' | 's3' | 'gcs';
  ALLOWED_MIME_TYPES: string;
  
  // AWS S3 Configuration (Required when STORAGE_TYPE=s3)
  AWS_S3_BUCKET?: string;
  AWS_S3_REGION?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  STORAGE_BASE_URL?: string;
  
  // Google Cloud Storage Configuration (Required when STORAGE_TYPE=gcs)
  GCS_BUCKET?: string;
  GCS_PROJECT_ID?: string;
  GCS_KEYFILE?: string;
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  
  // CORS Configuration
  CORS_ORIGINS?: string;
  
  // Geofencing Configuration
  DEFAULT_GEOFENCE_RADIUS: number;
  
  // WebSocket Configuration
  WS_MAX_CONNECTIONS: number;
  WS_MESSAGE_RATE_LIMIT: number;
}

class EnvValidator {
  private errors: string[] = [];
  private warnings: string[] = [];
  private config: Partial<EnvConfig> = {};

  validate(): EnvConfig {
    this.errors = [];
    this.warnings = [];
    
    const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';
    const isProduction = nodeEnv === 'production';
    
    // Validate NODE_ENV first
    if (!['development', 'production', 'test'].includes(nodeEnv)) {
      this.errors.push(`Invalid NODE_ENV: ${nodeEnv}. Must be 'development', 'production', or 'test'`);
    }
    this.config.NODE_ENV = nodeEnv;

    // Server Configuration
    this.config.PORT = this.validateNumber('PORT', 3000, false);
    this.config.WS_PORT = this.validateNumber('WS_PORT', 3001, false);
    this.config.LOG_LEVEL = process.env.LOG_LEVEL || 'info';

    // MongoDB Configuration - Required
    const mongoUri = isProduction ? process.env.MONGODB_URI_PROD : process.env.MONGODB_URI;
    if (!mongoUri) {
      this.errors.push(`MONGODB_URI is required (or MONGODB_URI_PROD in production)`);
    } else {
      this.config.MONGODB_URI = mongoUri;
      if (isProduction && process.env.MONGODB_URI_PROD) {
        this.config.MONGODB_URI_PROD = process.env.MONGODB_URI_PROD;
      }
    }

    // Redis Configuration - Optional
    this.config.REDIS_URL = process.env.REDIS_URL;
    this.config.REDIS_HOST = process.env.REDIS_HOST;
    this.config.REDIS_PORT = this.validateNumber('REDIS_PORT', 6379, true);
    this.config.REDIS_PASSWORD = process.env.REDIS_PASSWORD;
    this.config.REDIS_CLUSTER_MODE = process.env.REDIS_CLUSTER_MODE === 'true';
    this.config.REDIS_REQUIRED = process.env.REDIS_REQUIRED === 'true';

    // JWT Configuration - Required with strict validation
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      this.errors.push('JWT_SECRET is required');
    } else if (isProduction && jwtSecret.length < 32) {
      this.errors.push('JWT_SECRET must be at least 32 characters in production');
    } else if (isProduction && this.isWeakSecret(jwtSecret)) {
      this.errors.push('JWT_SECRET appears to be a default or weak value. Use a strong random secret in production');
    } else if (jwtSecret.length < 16) {
      this.warnings.push('JWT_SECRET is shorter than recommended (minimum 16 characters)');
    }
    this.config.JWT_SECRET = jwtSecret || '';

    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!jwtRefreshSecret) {
      this.errors.push('JWT_REFRESH_SECRET is required');
    } else if (isProduction && jwtRefreshSecret.length < 32) {
      this.errors.push('JWT_REFRESH_SECRET must be at least 32 characters in production');
    } else if (isProduction && this.isWeakSecret(jwtRefreshSecret)) {
      this.errors.push('JWT_REFRESH_SECRET appears to be a default or weak value. Use a strong random secret in production');
    } else if (jwtRefreshSecret.length < 16) {
      this.warnings.push('JWT_REFRESH_SECRET is shorter than recommended (minimum 16 characters)');
    }
    this.config.JWT_REFRESH_SECRET = jwtRefreshSecret || '';

    this.config.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';
    this.config.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '365d';

    // Caching Configuration
    this.config.CACHE_DEFAULT_TTL = this.validateNumber('CACHE_DEFAULT_TTL', 300, false);
    this.config.CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false';

    // Email Configuration - Optional
    this.config.SMTP_HOST = process.env.SMTP_HOST;
    this.config.SMTP_PORT = this.validateNumber('SMTP_PORT', 587, true);
    this.config.SMTP_USER = process.env.SMTP_USER;
    this.config.SMTP_PASS = process.env.SMTP_PASS;

    // File Upload Configuration
    this.config.UPLOAD_PATH = process.env.UPLOAD_PATH || './uploads';
    this.config.MAX_FILE_SIZE = this.validateNumber('MAX_FILE_SIZE', 5242880, false); // 5MB default
    this.config.STORAGE_TYPE = (process.env.STORAGE_TYPE || 'local') as 'local' | 's3' | 'gcs';
    this.config.ALLOWED_MIME_TYPES = process.env.ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/jpg,image/webp';

    // Storage-specific validation
    if (this.config.STORAGE_TYPE === 's3') {
      if (!process.env.AWS_S3_BUCKET) {
        this.errors.push('AWS_S3_BUCKET is required when STORAGE_TYPE=s3');
      }
      if (!process.env.AWS_S3_REGION) {
        this.errors.push('AWS_S3_REGION is required when STORAGE_TYPE=s3');
      }
      if (!process.env.AWS_ACCESS_KEY_ID) {
        this.errors.push('AWS_ACCESS_KEY_ID is required when STORAGE_TYPE=s3');
      }
      if (!process.env.AWS_SECRET_ACCESS_KEY) {
        this.errors.push('AWS_SECRET_ACCESS_KEY is required when STORAGE_TYPE=s3');
      }
      this.config.AWS_S3_BUCKET = process.env.AWS_S3_BUCKET;
      this.config.AWS_S3_REGION = process.env.AWS_S3_REGION || 'us-east-1';
      this.config.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
      this.config.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
      this.config.STORAGE_BASE_URL = process.env.STORAGE_BASE_URL;
    } else if (this.config.STORAGE_TYPE === 'gcs') {
      if (!process.env.GCS_BUCKET) {
        this.errors.push('GCS_BUCKET is required when STORAGE_TYPE=gcs');
      }
      if (!process.env.GCS_PROJECT_ID) {
        this.errors.push('GCS_PROJECT_ID is required when STORAGE_TYPE=gcs');
      }
      this.config.GCS_BUCKET = process.env.GCS_BUCKET;
      this.config.GCS_PROJECT_ID = process.env.GCS_PROJECT_ID;
      this.config.GCS_KEYFILE = process.env.GCS_KEYFILE;
    }

    // Rate Limiting
    this.config.RATE_LIMIT_WINDOW_MS = this.validateNumber('RATE_LIMIT_WINDOW_MS', 900000, false);
    this.config.RATE_LIMIT_MAX_REQUESTS = this.validateNumber('RATE_LIMIT_MAX_REQUESTS', 500, false);

    // CORS Configuration
    this.config.CORS_ORIGINS = process.env.CORS_ORIGINS;

    // Geofencing Configuration
    this.config.DEFAULT_GEOFENCE_RADIUS = this.validateNumber('DEFAULT_GEOFENCE_RADIUS', 100, false);

    // WebSocket Configuration
    this.config.WS_MAX_CONNECTIONS = this.validateNumber('WS_MAX_CONNECTIONS', 50, false);
    this.config.WS_MESSAGE_RATE_LIMIT = this.validateNumber('WS_MESSAGE_RATE_LIMIT', 60, false);

    // Display warnings
    if (this.warnings.length > 0) {
      console.warn('⚠️  Environment Configuration Warnings:');
      this.warnings.forEach(warning => console.warn(`   - ${warning}`));
    }

    // Fail if there are errors
    if (this.errors.length > 0) {
      console.error('❌ Environment Configuration Errors:');
      this.errors.forEach(error => console.error(`   - ${error}`));
      console.error('\nPlease fix the errors above and restart the application.');
      process.exit(1);
    }

    return this.config as EnvConfig;
  }

  private validateNumber(key: string, defaultValue: number, optional: boolean): number {
    const value = process.env[key];
    if (!value) {
      if (optional) {
        return defaultValue;
      }
      return defaultValue;
    }
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      if (optional) {
        return defaultValue;
      }
      this.errors.push(`${key} must be a valid number`);
      return defaultValue;
    }
    return num;
  }

  private isWeakSecret(secret: string): boolean {
    const weakPatterns = [
      'your-super-secret',
      'change-in-production',
      'secret',
      'password',
      'default',
      'test',
      '12345',
      'admin',
      'jwt-secret',
      'refresh-secret',
      'token-secret',
      'operion',
      'factory'
    ];
    const lowerSecret = secret.toLowerCase();
    // Check if secret contains any weak patterns
    const containsWeakPattern = weakPatterns.some(pattern => lowerSecret.includes(pattern));
    // Also check if it's a simple repetition or too simple
    const isTooSimple = secret.length < 16 || /^(.)\1+$/.test(secret);
    return containsWeakPattern || isTooSimple;
  }

  getConfig(): EnvConfig {
    return this.config as EnvConfig;
  }
}

// Validate and export environment configuration
const validator = new EnvValidator();
const env = validator.validate();

export default env;
export { EnvConfig };

