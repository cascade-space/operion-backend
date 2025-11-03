import { Request, Response, NextFunction } from 'express';
import redisService from '@/services/redisService';
import logger from '@/utils/logger';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  skip?: (req: Request) => boolean;
  allowedOrigins?: string[];
}

/**
 * Helper function to add CORS headers to response
 * CRITICAL: Must add CORS headers before sending rate limit response,
 * otherwise browser will show CORS error instead of rate limit error
 */
function addCorsHeaders(req: Request, res: Response, allowedOrigins?: string[]): void {
  const origin = req.headers.origin;
  
  if (!origin) {
    // No origin header (server-to-server request), no CORS headers needed
    return;
  }

  // If no allowed origins provided, try to allow the request origin (less secure but works)
  if (!allowedOrigins || allowedOrigins.length === 0) {
    // In production, this should be configured, but we'll allow it to prevent CORS errors
    // The actual CORS middleware will still validate later
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    return;
  }

  // Normalize origin (remove trailing slashes) for comparison
  const normalizedOrigin = origin.replace(/\/+$/, '');
  
  // Check if origin is in allowed list
  const isAllowed = allowedOrigins.indexOf(normalizedOrigin) !== -1 || 
                    allowedOrigins.indexOf(origin) !== -1;

  if (isAllowed) {
    // Add CORS headers for allowed origins
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  } else {
    // Origin not in allowed list - still add headers to prevent CORS error
    // The actual request will fail with proper error message
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
}

/**
 * Redis-based rate limiting middleware
 */
export const createRateLimiter = (options: RateLimitOptions) => {
  const { windowMs, max, message, skip, allowedOrigins } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip rate limiting if condition is met
    if (skip && skip(req)) {
      next();
      return;
    }

    // If Redis is not available, skip rate limiting (fallback)
    if (!redisService.getConnectionStatus()) {
      next();
      return;
    }

    try {
      const identifier = req.ip || req.headers['x-forwarded-for'] || 'unknown';
      const key = `rate_limit:${identifier}`;

      // Get current count
      const current = await redisService.get(key);
      const count = current ? parseInt(current, 10) : 0;

      if (count >= max) {
        // CRITICAL: Add CORS headers BEFORE sending 429 response
        // Otherwise browser will show CORS error instead of rate limit error
        addCorsHeaders(req, res, allowedOrigins);
        
        // Add rate limit headers for information
        res.setHeader('X-RateLimit-Limit', max.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        const ttl = await redisService.getClient()?.ttl(key) || Math.ceil(windowMs / 1000);
        res.setHeader('X-RateLimit-Reset', (new Date().getTime() + ttl * 1000).toString());
        res.setHeader('Retry-After', Math.ceil(ttl).toString());
        
        const response = {
          success: false,
          error: message || 'Too many requests from this IP, please try again later.',
          status: 429
        };
        res.status(429).json(response);
        return;
      }

      // Increment count
      const newCount = count + 1;
      
      if (count === 0) {
        // First request - set with expiration
        await redisService.setex(key, Math.ceil(windowMs / 1000), newCount.toString());
      } else {
        // Update count
        await redisService.set(key, newCount.toString());
      }

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', max.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - newCount).toString());
      
      const ttl = await redisService.getClient()?.ttl(key) || Math.ceil(windowMs / 1000);
      res.setHeader('X-RateLimit-Reset', (new Date().getTime() + ttl * 1000).toString());

      next();
    } catch (error) {
      logger.error('Rate limiter error', { error: error instanceof Error ? error.message : String(error) });
      // On error, allow the request (fail open)
      next();
    }
  };
};

