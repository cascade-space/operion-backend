import { Request, Response, NextFunction } from 'express';
import redisService from '@/services/redisService';
import logger from '@/utils/logger';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  skip?: (req: Request) => boolean;
}

/**
 * Redis-based rate limiting middleware
 */
export const createRateLimiter = (options: RateLimitOptions) => {
  const { windowMs, max, message, skip } = options;

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

