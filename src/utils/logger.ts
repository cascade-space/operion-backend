import winston from 'winston';
import { Writable } from 'stream';
import env from '@/config/env';
import cloudWatchLogger from '@/utils/cloudwatch';

// Create a format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format for development (more readable)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: env.LOG_LEVEL || (env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: logFormat,
  defaultMeta: {
    service: 'operion-backend',
    environment: env.NODE_ENV
  },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: env.NODE_ENV === 'production' ? logFormat : consoleFormat
    })
  ]
});

// Custom transport to send logs to CloudWatch
if (env.NODE_ENV === 'production' && process.env.CLOUDWATCH_LOG_GROUP) {
  // Create a proper Writable stream for Winston
  const cloudWatchStream = new Writable({
    write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
      try {
        const message = chunk.toString('utf8');
        const logData = JSON.parse(message.trim());
        cloudWatchLogger.log(logData.level, logData.message, logData).catch(() => {
          // Silently fail - don't break application if CloudWatch fails
        });
      } catch {
        // If parsing fails, send as-is
        cloudWatchLogger.log('info', chunk.toString('utf8')).catch(() => {});
      }
      callback();
    }
  });

  logger.add(new winston.transports.Stream({
    stream: cloudWatchStream
  }));
}

// Add file transports in production
if (env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
  
  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
}

// Request correlation ID tracking
const correlationIds = new Map<string, string>();

// Generate or retrieve correlation ID for a request
export const getCorrelationId = (req?: any): string => {
  if (!req) {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Try to get from request headers
  const existingId = req.headers['x-correlation-id'] || req.headers['x-request-id'];
  if (existingId && typeof existingId === 'string') {
    return existingId;
  }
  
  // Generate new ID
  const newId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  correlationIds.set(newId, newId);
  return newId;
};

// Logger with context support
class ContextLogger {
  private correlationId?: string;
  private factoryId?: string;
  private userId?: string;

  setContext(correlationId: string, factoryId?: string, userId?: string): void {
    this.correlationId = correlationId;
    this.factoryId = factoryId;
    this.userId = userId;
  }

  private getMetadata(additionalMeta?: Record<string, any>): Record<string, any> {
    const meta: Record<string, any> = {
      ...additionalMeta
    };
    
    if (this.correlationId) {
      meta.correlationId = this.correlationId;
    }
    if (this.factoryId) {
      meta.factoryId = this.factoryId;
    }
    if (this.userId) {
      meta.userId = this.userId;
    }
    
    return meta;
  }

  error(message: string, meta?: Record<string, any>): void {
    logger.error(message, this.getMetadata(meta));
  }

  warn(message: string, meta?: Record<string, any>): void {
    logger.warn(message, this.getMetadata(meta));
  }

  info(message: string, meta?: Record<string, any>): void {
    logger.info(message, this.getMetadata(meta));
  }

  debug(message: string, meta?: Record<string, any>): void {
    logger.debug(message, this.getMetadata(meta));
  }

  log(level: string, message: string, meta?: Record<string, any>): void {
    logger.log(level, message, this.getMetadata(meta));
  }
}

// Create context logger instance
export const contextLogger = new ContextLogger();

// Export default logger (without context)
export default logger;

// Performance logging helper
export const logPerformance = (operation: string, duration: number, meta?: Record<string, any>): void => {
  const level = duration > 1000 ? 'warn' : 'info';
  logger.log(level, `Performance: ${operation}`, {
    ...meta,
    duration: `${duration}ms`,
    operation
  });
};

// Request logging middleware helper
export const logRequest = (req: any, res: any, duration?: number): void => {
  const correlationId = getCorrelationId(req);
  const logData: Record<string, any> = {
    method: req.method,
    path: req.path,
    ip: req.ip || req.headers['x-forwarded-for'],
    userAgent: req.headers['user-agent'],
    correlationId
  };

  if (req.user) {
    logData.userId = req.user._id?.toString() || req.user.id;
    logData.userRole = req.user.role;
  }
  if (req.factoryId) {
    logData.factoryId = req.factoryId;
  }
  if (duration !== undefined) {
    logData.duration = `${duration}ms`;
  }

  logger.info(`${req.method} ${req.path}`, logData);
};

/**
 * Log error and mark it as logged to prevent duplicate logging in error handler middleware
 * Use this in controllers instead of logger.error() directly
 */
export const logError = (message: string, error: any, metadata?: Record<string, any>): void => {
  logger.error(message, {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...metadata
  });
  
  // Mark error as logged to prevent duplicate logging in error handler middleware
  if (error && typeof error === 'object') {
    (error as any)._logged = true;
  }
};

