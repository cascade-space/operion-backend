import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import logger from '@/utils/logger';

interface CachedRequest {
  response: any;
  timestamp: number;
}

/**
 * Request deduplication middleware
 * Prevents duplicate submissions from accidental double-clicks or network retries
 * Caches request signatures for 5 seconds
 */
class RequestDeduplication {
  private cache: Map<string, CachedRequest> = new Map();
  private readonly CACHE_DURATION = 5000; // 5 seconds
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up expired entries every 10 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 10000);
  }

  /**
   * Generate request signature from method, path, body, and user ID
   */
  private generateSignature(req: Request): string {
    const method = req.method;
    const path = req.path;
    const body = req.body ? JSON.stringify(req.body) : '';
    const userId = (req as any).user?.id || (req as any).user?._id?.toString() || 'anonymous';
    
    const signature = `${method}:${path}:${userId}:${body}`;
    return crypto.createHash('sha256').update(signature).digest('hex');
  }

  /**
   * Clean up expired cache entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_DURATION) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Middleware to deduplicate requests
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      // Only apply to state-changing methods
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        next();
        return;
      }

      // Skip for health checks and certain endpoints
      if (req.path === '/health' || req.path.startsWith('/api/csrf-token')) {
        next();
        return;
      }

      const signature = this.generateSignature(req);
      const cached = this.cache.get(signature);

      if (cached) {
        const age = Date.now() - cached.timestamp;
        if (age < this.CACHE_DURATION) {
          // Return cached response
          logger.debug('Request deduplication: returning cached response', {
            path: req.path,
            method: req.method,
            age: `${age}ms`
          });
          
          // Clone response to avoid issues
          const cachedResponse = JSON.parse(JSON.stringify(cached.response));
          res.status(cachedResponse.status || 200).json(cachedResponse);
          return;
        } else {
          // Expired, remove from cache
          this.cache.delete(signature);
        }
      }

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache response
      res.json = function(body: any) {
        // Cache successful responses only
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const cacheEntry: CachedRequest = {
            response: body,
            timestamp: Date.now()
          };
          requestDeduplication.cache.set(signature, cacheEntry);
        }
        
        return originalJson(body);
      };

      next();
    };
  }

  /**
   * Clear all cached requests
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Stop cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

export const requestDeduplication = new RequestDeduplication();

