import { Request, Response, NextFunction } from 'express';
import redisService from '@/services/redisService';
import logger from '@/utils/logger';

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

/**
 * Response caching middleware
 * Caches responses for frequently accessed readonly endpoints
 * Uses Redis if available, falls back to memory cache
 */
class ResponseCache {
  private memoryCache: Map<string, CacheEntry> = new Map();
  private readonly DEFAULT_TTL = 30000; // 30 seconds
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupMemoryCache();
    }, 60000);
  }

  /**
   * Generate cache key from request
   */
  private generateCacheKey(req: Request): string {
    const path = req.path;
    const query = req.query ? JSON.stringify(req.query) : '';
    const userId = (req as any).user?.id || (req as any).user?._id?.toString() || 'anonymous';
    return `cache:${req.method}:${path}:${userId}:${query}`;
  }

  /**
   * Clean up expired memory cache entries
   */
  private cleanupMemoryCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Get cached response
   */
  private async getCached(key: string): Promise<any | null> {
    // Try Redis first if available
    if (redisService.getConnectionStatus()) {
      try {
        const cached = await redisService.get(key);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (error) {
        logger.debug('Redis cache get failed, falling back to memory', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Fallback to memory cache
    const entry = this.memoryCache.get(key);
    if (entry) {
      const now = Date.now();
      if (now - entry.timestamp < entry.ttl) {
        return entry.data;
      } else {
        this.memoryCache.delete(key);
      }
    }

    return null;
  }

  /**
   * Set cached response
   */
  private async setCached(key: string, data: any, ttl: number): Promise<void> {
    // Try Redis first if available
    if (redisService.getConnectionStatus()) {
      try {
        await redisService.setex(key, Math.floor(ttl / 1000), JSON.stringify(data)); // Redis TTL in seconds
        return;
      } catch (error) {
        logger.debug('Redis cache set failed, falling back to memory', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Fallback to memory cache
    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Invalidate cache for a pattern
   */
  async invalidate(pattern: string): Promise<void> {
    // Invalidate Redis cache
    if (redisService.getConnectionStatus()) {
      try {
        // Note: Redis pattern matching requires SCAN, which is more complex
        // For now, we'll just clear memory cache
        // In production, use Redis keys command with pattern matching
      } catch (error) {
        logger.debug('Redis cache invalidation failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Clear memory cache entries matching pattern
    for (const key of this.memoryCache.keys()) {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Middleware factory for response caching
   */
  middleware(ttl: number = this.DEFAULT_TTL) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Only cache GET requests
      if (req.method !== 'GET') {
        next();
        return;
      }

      // Skip caching for certain endpoints
      if (req.path === '/health' || req.path.startsWith('/api/csrf-token')) {
        next();
        return;
      }

      const cacheKey = this.generateCacheKey(req);
      
      // Try to get cached response
      const cached = await this.getCached(cacheKey);
      if (cached) {
        logger.debug('Response cache hit', { path: req.path });
        res.status(cached.status || 200).json(cached.data);
        return;
      }

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache response
      res.json = function(body: any) {
        // Cache successful responses only
        if (res.statusCode >= 200 && res.statusCode < 300) {
          responseCache.setCached(cacheKey, {
            data: body,
            status: res.statusCode
          }, ttl).catch(error => {
            logger.debug('Failed to cache response', {
              error: error instanceof Error ? error.message : String(error)
            });
          });
        }
        
        return originalJson(body);
      };

      next();
    };
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

export const responseCache = new ResponseCache();

