import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { createRateLimiter } from '@/middleware/rateLimiter';
import fileUpload from 'express-fileupload';
import { createServer } from 'http';
import path from 'path';

// Validate environment variables first (fails fast if invalid)
import env from '@/config/env';

// Initialize Sentry before other imports
import { initSentry, captureException } from '@/utils/sentry';
initSentry();

import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '@/config/database';
import { ApiResponse } from '@/types';
import { wsServer } from '@/services/websocketServer';
import redisService from '@/services/redisService';
import cronService from '@/services/cronService'; // Initialize cron jobs (photo cleanup, validation cleanup, etc.)
import { errorHandler, timeoutMiddleware } from '@/middleware/errorHandler';
import { csrfTokenMiddleware, csrfProtectionMiddleware } from '@/middleware/csrf';
import { requestDeduplication } from '@/middleware/deduplication';
import { responseCache } from '@/middleware/cacheMiddleware';
import logger, { getCorrelationId, logRequest } from '@/utils/logger';
import { memoryMonitor } from '@/utils/memoryMonitor';

// Import routes
import authRoutes from '@/routes/auth';
import factoryRoutes from '@/routes/factory';
import userRoutes from '@/routes/user';
import productRoutes from '@/routes/product';
import processRoutes from '@/routes/process';
import machineRoutes from '@/routes/machine';
import attendanceRoutes from '@/routes/attendance';
import workEntryRoutes from '@/routes/workEntry';
import dashboardRoutes from '@/routes/dashboard';
import reportsRoutes from '@/routes/reports';
import processStageRoutes from '@/routes/processStage';

const app = express();
const server = createServer(app);
const PORT = env.PORT;

// Trust proxy - Required when behind nginx reverse proxy
// This allows Express to read X-Forwarded-For headers correctly
app.set('trust proxy', true);

// Export app for testing
export { app };

// CORS configuration - MUST be defined early to handle preflight requests before other middleware
const getCorsOrigins = (): string[] => {
  const defaultDevOrigins = [
    'http://localhost:8080',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:4173',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174'
  ];
  
  if (env.CORS_ORIGINS) {
    const envOrigins = env.CORS_ORIGINS.split(',')
      .map(origin => origin.trim())
      .map(origin => origin.replace(/\/+$/, '')) // Remove trailing slashes
      .filter(origin => origin.length > 0); // Remove empty strings
    // In development, merge with default origins to ensure localhost works
    if (env.NODE_ENV === 'development') {
      const merged = [...new Set([...defaultDevOrigins, ...envOrigins])];
      logger.info('CORS origins (merged with defaults):', { origins: merged });
      return merged;
    }
    return envOrigins;
  }
  
  // Fallback to localhost origins for development
  if (env.NODE_ENV === 'development') {
    logger.info('CORS using default development origins:', { origins: defaultDevOrigins });
    return defaultDevOrigins;
  }
  
  // Production: empty array means no origins allowed (must be explicitly configured)
  return [];
};

const allowedOrigins = getCorsOrigins();

// Log CORS configuration on startup
logger.info('CORS Configuration', {
  environment: env.NODE_ENV,
  allowedOrigins,
  originsCount: allowedOrigins.length,
  hasEnvCorsOrigins: !!env.CORS_ORIGINS
});

// Validate CORS configuration in production
if (env.NODE_ENV === 'production') {
  if (allowedOrigins.length === 0) {
    logger.error('⚠️  CRITICAL: CORS_ORIGINS is not set in production!');
    logger.error('⚠️  Your frontend will be blocked from making requests.');
    logger.error('⚠️  Set CORS_ORIGINS environment variable with your frontend URL(s).');
    logger.error('⚠️  Example: CORS_ORIGINS=https://www.cascade-erp.in,https://cascade-erp.in');
    logger.error('⚠️  Format: comma-separated URLs, no spaces, no trailing slashes');
    logger.warn('⚠️  Server will start but CORS will reject all requests until configured.');
  } else {
    logger.info('✅ CORS configured for production origins:', { origins: allowedOrigins });
    
    // Warn if common production domains are missing
    const commonDomains = ['https://www.cascade-erp.in', 'https://cascade-erp.in'];
    const missingDomains = commonDomains.filter(domain => 
      !allowedOrigins.some(origin => origin === domain || origin.includes(domain.replace('https://', '')))
    );
    
    if (missingDomains.length > 0) {
      logger.warn('⚠️  Common production domains not found in CORS_ORIGINS:', { 
        missing: missingDomains,
        suggestion: `Consider adding: ${missingDomains.join(', ')}`
      });
    }
  }
} else {
  // In development, log the configuration
  logger.info('✅ CORS configured for development', { 
    origins: allowedOrigins,
    note: 'Default localhost origins are always included in development'
  });
}

// CRITICAL FIX: Handle OPTIONS preflight requests as FIRST middleware
// This MUST run before Helmet, rate limiting, and other middleware
app.use((req, res, next) => {
  // Only handle OPTIONS requests (preflight)
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    
    // Allow server-to-server requests (no origin header)
    if (!origin) {
      res.status(200).end();
      return;
    }
    
    // Normalize origin (remove trailing slashes) for comparison
    const normalizedOrigin = origin.replace(/\/+$/, '');
    
    // Check if origin is in allowed list
    // CRITICAL: Do NOT allow if allowedOrigins.length === 0 (security issue)
    const isAllowed = allowedOrigins.length > 0 && 
      (allowedOrigins.indexOf(normalizedOrigin) !== -1 || 
       allowedOrigins.indexOf(origin) !== -1);
    
    if (isAllowed) {
      // Send CORS headers for allowed origins
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
      res.header('Access-Control-Max-Age', '86400'); // 24 hours
      res.status(200).end();
      return; // Stop here, don't continue to other middleware
    } else {
      // Origin not allowed - log and block
      if (allowedOrigins.length === 0) {
        logger.warn('CORS preflight blocked: No allowed origins configured', { 
          origin,
          normalizedOrigin 
        });
      } else {
        logger.warn('CORS preflight blocked: Origin not in allowed list', { 
          origin,
          normalizedOrigin,
          allowedOrigins 
        });
      }
      // Send 403 but still respond (browser will block actual request)
      res.status(403).end();
      return;
    }
  }
  // Not an OPTIONS request, continue to next middleware
  next();
});

// Rate limiting - Use Redis if available, otherwise fallback to memory store
// In development, use much more lenient limits or disable entirely
const useRedisRateLimit = env.REDIS_URL || env.REDIS_HOST;
const isDevelopment = env.NODE_ENV === 'development';

// Much more lenient rate limits for development
const rateLimitWindowMs = env.RATE_LIMIT_WINDOW_MS; // 15 minutes default
const rateLimitMax = isDevelopment 
  ? 10000 // 10,000 requests per window in development (effectively unlimited)
  : env.RATE_LIMIT_MAX_REQUESTS; // Use configured limit in production

// Helper to add CORS headers to rate limit responses (for express-rate-limit)
const addCorsToRateLimitResponse = (req: Request, res: Response) => {
  const origin = req.headers.origin;
  if (!origin) return;
  
  const normalizedOrigin = origin.replace(/\/+$/, '');
  const isAllowed = allowedOrigins.length > 0 && 
    (allowedOrigins.indexOf(normalizedOrigin) !== -1 || 
     allowedOrigins.indexOf(origin) !== -1);
  
  if (isAllowed || allowedOrigins.length === 0) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  }
};

if (useRedisRateLimit && redisService.getConnectionStatus()) {
  // Use Redis-based rate limiting for distributed systems
  const redisLimiter = createRateLimiter({
    windowMs: rateLimitWindowMs,
    max: rateLimitMax,
    message: 'Too many requests from this IP, please try again later.',
    allowedOrigins: allowedOrigins, // Pass allowed origins to rate limiter for CORS headers
    skip: (req) => {
      // Skip rate limiting for health check endpoint and in development
      return req.path === '/health' || isDevelopment;
    }
  });
  app.use(redisLimiter);
} else {
  // Fallback to memory-based rate limiting
  // Note: express-rate-limit doesn't support CORS headers directly, so we need a wrapper
  const limiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: rateLimitMax,
    message: {
      success: false,
      error: 'Too many requests from this IP, please try again later.',
      status: 429
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      // Add CORS headers before sending rate limit response
      addCorsToRateLimitResponse(req, res);
      
      res.status(429).json({
        success: false,
        error: 'Too many requests from this IP, please try again later.',
        status: 429
      });
    },
    skip: (req) => {
      // Skip rate limiting for health check endpoint
      // Note: We're already using high limits in development, so skip is mainly for health checks
      return req.path === '/health';
    }
  });
  app.use(limiter);
}

// CORS middleware for actual requests (preflight is handled above)
const corsOptions = {
  origin: function (origin: string | undefined, callback: Function) {
    // Enhanced logging for CORS issues
    if (env.NODE_ENV === 'development') {
      logger.info('CORS request received', { 
        origin: origin || '(no origin)', 
        allowedOrigins, 
        hasOrigin: !!origin,
        originAllowed: origin ? (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.indexOf(origin.replace(/\/+$/, '')) !== -1) : 'N/A (no origin)'
      });
    }
    
    // Allow requests with no origin for:
    // 1. Health checks and monitoring tools (curl, server-to-server)
    // 2. Mobile apps or API clients that don't send origin
    // Note: CORS only applies to browser requests. Server-to-server requests
    // (like curl, health checks, monitoring) don't have origins and are safe to allow.
    if (!origin) {
      // Allow no-origin requests in both development and production
      // This is safe because:
      // - CORS is a browser security feature, not needed for server-to-server
      // - Health checks and monitoring tools need to work
      // - Browser requests will still have origin headers and be validated below
      if (env.NODE_ENV === 'development') {
        logger.info('CORS: Allowing request with no origin (development mode)');
      } else {
        logger.info('CORS: Allowing request with no origin (production - health checks/monitoring)');
      }
      return callback(null, true);
    }
    
    // CRITICAL: If no origins are configured in production, block all browser requests
    if (allowedOrigins.length === 0) {
      const errorMsg = 'CORS: No allowed origins configured. Set CORS_ORIGINS environment variable.';
      logger.error(errorMsg, { 
        origin,
        environment: env.NODE_ENV,
        hint: 'Example: CORS_ORIGINS=https://www.cascade-erp.in,https://cascade-erp.in'
      });
      return callback(new Error('CORS not configured'));
    }
    
    // Normalize origin (remove trailing slashes) for comparison
    const normalizedOrigin = origin.replace(/\/+$/, '');
    
    // Check both normalized and original origin in allowed list
    const isAllowed = allowedOrigins.indexOf(normalizedOrigin) !== -1 || 
                      allowedOrigins.indexOf(origin) !== -1;
    
    if (isAllowed) {
      if (env.NODE_ENV === 'development') {
        logger.info('CORS: Allowing origin', { origin, normalizedOrigin, allowedOrigins });
      }
      callback(null, true);
    } else {
      // Log blocking in production for debugging
      logger.warn('CORS: Blocking origin - not in allowed list', { 
        origin, 
        normalizedOrigin, 
        allowedOrigins,
        environment: env.NODE_ENV 
      });
      callback(new Error(`Not allowed by CORS. Origin: ${origin} not in allowed list: ${allowedOrigins.join(', ')}`));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Content-Length', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin resource sharing
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },
  permissionsPolicy: {
    camera: ["'self'"],
    microphone: ["'self'"],
    geolocation: ["'self'"],
    fullscreen: ["'self'"]
  }
}));

// Compression middleware
app.use(compression());

// Cookie parser middleware
app.use(cookieParser());

// CSRF token middleware - must be after cookie parser
// This sets the CSRF token cookie for all requests
app.use(csrfTokenMiddleware);

// Logging middleware
const logLevel = env.LOG_LEVEL || (env.NODE_ENV === 'development' ? 'dev' : 'combined');
app.use(morgan(logLevel));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// File upload middleware (secure alternative to multer)
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  abortOnLimit: true,
  responseOnLimit: 'File size limit has been reached',
  useTempFiles: true,
  tempFileDir: '/tmp/',
  debug: process.env.NODE_ENV === 'development',
  safeFileNames: true,
  preserveExtension: true,
  createParentPath: true
}));

// Static file serving - only for local storage mode
// In production with S3/GCS, files should be served from cloud storage URLs
if (env.STORAGE_TYPE === 'local') {
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
} else {
  logger.info('Static file serving disabled - using cloud storage', { storageType: env.STORAGE_TYPE });
  logger.info('Files should be accessed via storage service URLs');
}

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const correlationId = getCorrelationId(req);
  req.headers['x-correlation-id'] = correlationId;
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logRequest(req, res, duration);
  });
  
  next();
});

// Request deduplication middleware (prevents duplicate submissions)
app.use(requestDeduplication.middleware());

// CSRF token endpoint - allows frontend to get CSRF token
app.get('/api/csrf-token', (req, res) => {
  // CSRF token is already set in cookie by csrfTokenMiddleware
  // Return it in response body as well for convenience
  const response: ApiResponse = {
    success: true,
    data: {
      csrfToken: req.csrfToken ? req.csrfToken() : undefined
    },
    status: 200
  };
  res.json(response);
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const startTime = Date.now();
  const healthCheck: any = {
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      ...process.memoryUsage(),
      heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
    },
    environment: env.NODE_ENV,
    services: {} as Record<string, any>
  };

  // Check MongoDB connection with latency
  const mongoStart = Date.now();
  try {
    if (mongoose.connection.db) {
      await mongoose.connection.db.admin().ping();
    }
    const mongoLatency = Date.now() - mongoStart;
    healthCheck.services.mongodb = {
      status: 'connected',
      latency: `${mongoLatency}ms`,
      readyState: mongoose.connection.readyState
    };
  } catch (error) {
    healthCheck.services.mongodb = {
      status: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      readyState: mongoose.connection.readyState
    };
    healthCheck.success = false;
    healthCheck.message = 'Database connection failed';
  }

  // Check Redis connection with latency
  const redisStart = Date.now();
  let redisHealthy = false;
  let redisLatency = 0;
  if (redisService.getConnectionStatus()) {
    try {
      await redisService.ping();
      redisLatency = Date.now() - redisStart;
      redisHealthy = true;
      healthCheck.services.redis = {
        status: 'connected',
        latency: `${redisLatency}ms`
      };
    } catch (error) {
      redisHealthy = false;
      healthCheck.services.redis = {
        status: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  } else {
    healthCheck.services.redis = {
      status: 'not configured',
      latency: 'N/A'
    };
  }

  // Check storage service health
  try {
    const { storageService } = await import('@/services/storageService');
    const storageStart = Date.now();
    // Try to check if storage service is initialized (doesn't throw)
    const storageLatency = Date.now() - storageStart;
    healthCheck.services.storage = {
      status: 'configured',
      type: env.STORAGE_TYPE,
      latency: `${storageLatency}ms`
    };
  } catch (error) {
    healthCheck.services.storage = {
      status: 'error',
      type: env.STORAGE_TYPE,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }

  // If Redis is critical and not connected, mark as unhealthy
  const redisRequired = process.env.REDIS_REQUIRED === 'true';
  if (redisRequired && !redisHealthy) {
    healthCheck.success = false;
    healthCheck.message = 'Critical service (Redis) unavailable';
    return res.status(503).json(healthCheck);
  }

  const responseTime = Date.now() - startTime;
  healthCheck.responseTime = `${responseTime}ms`;

  res.status(healthCheck.success ? 200 : 503).json(healthCheck);
});

// Apply CSRF protection to all API routes (except GET/HEAD/OPTIONS)
// Note: CSRF protection is applied per route, not globally
// We'll apply it in individual route files where needed

// API routes with versioning
const API_VERSION = '/api/v1';
app.use(`${API_VERSION}/auth`, authRoutes);
app.use(`${API_VERSION}/factories`, factoryRoutes);
app.use(`${API_VERSION}/users`, userRoutes);
app.use(`${API_VERSION}/products`, productRoutes);
app.use(`${API_VERSION}/processes`, processRoutes);
app.use(`${API_VERSION}/machines`, machineRoutes);
app.use(`${API_VERSION}/attendance`, attendanceRoutes);
app.use(`${API_VERSION}/work-entries`, workEntryRoutes);
app.use(`${API_VERSION}/dashboard`, dashboardRoutes);
app.use(`${API_VERSION}/reports`, reportsRoutes);
app.use(`${API_VERSION}/process-stages`, processStageRoutes);

// Backward compatibility: Also mount routes at /api (will be deprecated)
app.use('/api/auth', authRoutes);
app.use('/api/factories', factoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', responseCache.middleware(30000), productRoutes); // Cache for 30 seconds
app.use('/api/processes', responseCache.middleware(30000), processRoutes); // Cache for 30 seconds
app.use('/api/machines', machineRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/work-entries', workEntryRoutes);
app.use('/api/dashboard', responseCache.middleware(30000), dashboardRoutes); // Cache for 30 seconds
app.use('/api/reports', timeoutMiddleware(30000), reportsRoutes); // 30s timeout for reports
app.use('/api/process-stages', processStageRoutes);

// 404 handler
app.use('*', (req, res) => {
  const response: ApiResponse = {
    success: false,
    error: 'Route not found',
    status: 404
  };
  res.status(404).json(response);
});

// Global error handler (must be last)
app.use(errorHandler);


// Retry helper with exponential backoff
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  operation: string,
  maxRetries: number = 3,
  initialDelay: number = 2000
): Promise<T> => {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) {
        logger.error(`${operation} failed after ${maxRetries} attempts`, {
          error: lastError.message,
          stack: lastError.stack,
          attempts: maxRetries
        });
        throw lastError;
      }
      
      const delay = initialDelay * Math.pow(2, attempt - 1);
      logger.warn(`${operation} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms`, {
        error: lastError.message,
        attempt,
        maxRetries,
        delay
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error(`${operation} failed after ${maxRetries} attempts`);
};

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB with retry logic
    await retryWithBackoff(
      async () => {
        logger.info('Attempting to connect to MongoDB...');
        await connectDB();
        logger.info('MongoDB connected successfully');
      },
      'MongoDB connection',
      3, // Max 3 retries
      2000 // Start with 2s delay
    );
    
    // Run migrations if enabled
    if (process.env.AUTO_MIGRATE === 'true') {
      try {
        const migrationRunner = (await import('@/migrations/migrationRunner')).default;
        await migrationRunner.migrate();
      } catch (error) {
        logger.error('Migration failed on startup', { error: error instanceof Error ? error.message : String(error) });
        // Don't fail server startup if migrations fail
      }
    }
    
    // Connect to Redis (non-blocking - app can run without Redis in dev)
    try {
      await redisService.connect();
      logger.info('Redis connected');
    } catch (error) {
      const redisRequired = process.env.REDIS_REQUIRED === 'true';
      if (redisRequired) {
        logger.error('Redis connection failed (required)', { error: error instanceof Error ? error.message : String(error) });
        // Redis is required, but don't crash - let it retry or fail gracefully
        throw error;
      } else {
        logger.warn('Redis connection failed (optional)', { error: error instanceof Error ? error.message : String(error) });
        logger.warn('Running without Redis - caching and WebSocket clustering disabled');
      }
    }
    
    // Initialize WebSocket server
    wsServer.initialize(server);

    // Start memory monitoring
    memoryMonitor.start();

    // Start HTTP server
    server.listen(PORT, () => {
      logger.info('Server started', {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        redis: redisService.getConnectionStatus() ? 'connected' : 'not connected',
        pid: process.pid,
        uptime: `${process.uptime()}s`
      });
    });
  } catch (error) {
    const errorDetails = {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      pid: process.pid,
      uptime: `${process.uptime()}s`,
      memory: {
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`
      },
      timestamp: new Date().toISOString()
    };
    
    logger.error('Failed to start server - critical error after retries', errorDetails);
    
    // Send to Sentry
    if (error instanceof Error) {
      captureException(error, {
        context: errorDetails
      });
    }
    
    // Only exit if it's a critical service failure after all retries
    logger.error('Server startup failed - exiting process');
    process.exit(1);
  }
};

// Handle graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);
  
  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');
    
    // Close Redis connections
    try {
      await redisService.disconnect();
      logger.info('Redis disconnected');
    } catch (error) {
      logger.error('Error disconnecting Redis', { error: error instanceof Error ? error.message : String(error) });
    }
    
    // Close MongoDB connection (this also clears the pool monitor interval)
    try {
      await disconnectDB();
      logger.info('MongoDB disconnected');
    } catch (error) {
      logger.error('Error disconnecting MongoDB', { error: error instanceof Error ? error.message : String(error) });
    }
    
    // Close WebSocket server
    try {
      wsServer.close();
      logger.info('WebSocket server closed');
    } catch (error) {
      logger.error('Error closing WebSocket server', { error: error instanceof Error ? error.message : String(error) });
    }

    // Stop memory monitoring
    try {
      memoryMonitor.stop();
      logger.info('Memory monitoring stopped');
    } catch (error) {
      logger.error('Error stopping memory monitor', { error: error instanceof Error ? error.message : String(error) });
    }
    
    logger.info('Process terminated');
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Global error handlers - MUST be registered before starting the server
// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  const errorContext = {
    error: error.message,
    stack: error.stack,
    pid: process.pid,
    uptime: `${process.uptime()}s`,
    memory: {
      heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`
    },
    timestamp: new Date().toISOString()
  };
  
  logger.error('Uncaught Exception - Fatal Error', errorContext);
  
  // Send to Sentry
  captureException(error, {
    context: errorContext
  });
  
  // Attempt graceful shutdown instead of immediate exit
  gracefulShutdown('uncaughtException').catch(() => {
    // If graceful shutdown fails, force exit after a delay
    setTimeout(() => {
      logger.error('Forcing exit after uncaughtException graceful shutdown failed');
      process.exit(1);
    }, 5000);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  const rejectionContext = {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    pid: process.pid,
    uptime: `${process.uptime()}s`,
    timestamp: new Date().toISOString()
  };
  
  logger.error('Unhandled Promise Rejection', rejectionContext);
  
  // Send to Sentry if it's an Error object
  if (reason instanceof Error) {
    captureException(reason, {
      context: rejectionContext
    });
  }
  
  // In production, we might want to log and continue instead of crashing
  // In development, log detailed info but don't crash
  if (env.NODE_ENV === 'production') {
    logger.warn('Unhandled rejection logged - process continuing');
  }
});

// Process keepalive - periodic heartbeat logging
if (process.env.ENABLE_HEARTBEAT !== 'false') {
  const heartbeatInterval = setInterval(() => {
    const memoryUsage = process.memoryUsage();
    logger.info('Process heartbeat', {
      pid: process.pid,
      uptime: `${Math.round(process.uptime())}s`,
      memory: {
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
      },
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      redis: redisService.getConnectionStatus() ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  }, 5 * 60 * 1000); // Every 5 minutes
  
  // Clear interval on shutdown
  process.on('SIGTERM', () => clearInterval(heartbeatInterval));
  process.on('SIGINT', () => clearInterval(heartbeatInterval));
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
startServer();
