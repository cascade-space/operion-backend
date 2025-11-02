import redisService from './redisService';
import logger from '@/utils/logger';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  factoryId?: string; // For factory-scoped cache keys
}

/**
 * Cache Service with Redis backend
 * 
 * CACHE INVALIDATION PATTERNS:
 * 
 * 1. User cache invalidation:
 *    - Pattern: `user:{userId}`
 *    - Invalidate when: User profile updated, role changed, factory changed
 *    - TTL: 15 minutes (aligned with JWT expiry)
 * 
 * 2. Dashboard cache invalidation:
 *    - Pattern: `dashboard:{factoryId}:*`
 *    - Invalidate when: Work entry created/updated/deleted, attendance changes
 *    - TTL: 5 minutes
 * 
 * 3. Factory cache invalidation:
 *    - Pattern: `factory:{factoryId}:*`
 *    - Invalidate when: Factory settings updated, products/processes changed
 *    - TTL: Varies by data type (1-30 minutes)
 * 
 * 4. Report cache invalidation:
 *    - Pattern: `report:{factoryId}:{type}:*`
 *    - Invalidate when: Related data changes (work entries, attendance)
 *    - TTL: 10 minutes
 * 
 * CACHE WARMING STRATEGIES:
 * - Warm frequently accessed data on server startup
 * - Pre-cache user data during authentication
 * - Cache aggregation results for reports
 * 
 * METRICS:
 * - Cache hits/misses are tracked for monitoring
 * - Metrics available via getMetrics() method
 */
class CacheService {
  private enabled: boolean;
  private defaultTTL: number;
  private hitCount: number = 0;
  private missCount: number = 0;
  private errorCount: number = 0;

  constructor() {
    // Cache is enabled if Redis is configured
    this.enabled = !!process.env.REDIS_URL || !!process.env.REDIS_HOST;
    this.defaultTTL = parseInt(process.env.CACHE_DEFAULT_TTL || '300'); // 5 minutes default
  }

  /**
   * Build a cache key with optional factory isolation
   */
  private buildKey(key: string, options?: CacheOptions): string {
    if (options?.factoryId) {
      return `factory:${options.factoryId}:${key}`;
    }
    return key;
  }

  /**
   * Get value from cache
   * Tracks hit/miss metrics for monitoring
   */
  async get<T = any>(key: string, options?: CacheOptions): Promise<T | null> {
    if (!this.enabled) {
      this.missCount++;
      return null;
    }

    if (!redisService.getConnectionStatus()) {
      this.missCount++;
      return null;
    }

    try {
      const cacheKey = this.buildKey(key, options);
      const value = await redisService.get(cacheKey);
      
      if (!value) {
        this.missCount++;
        return null;
      }

      this.hitCount++;
      return JSON.parse(value) as T;
    } catch (error) {
      this.errorCount++;
      this.missCount++;
      logger.error(`Cache: GET error for key ${key}`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null; // Return null on error to fall back to DB
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set<T = any>(key: string, value: T, options?: CacheOptions): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (!redisService.getConnectionStatus()) {
      return;
    }

    try {
      const cacheKey = this.buildKey(key, options);
      const ttl = options?.ttl || this.defaultTTL;
      const serialized = JSON.stringify(value);
      
      await redisService.setex(cacheKey, ttl, serialized);
    } catch (error) {
      this.errorCount++;
      logger.error(`Cache: SET error for key ${key}`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
      // Don't throw - cache failures shouldn't break the app
    }
  }

  /**
   * Delete a cache key
   */
  async invalidate(key: string, options?: CacheOptions): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (!redisService.getConnectionStatus()) {
      return;
    }

    try {
      const cacheKey = this.buildKey(key, options);
      await redisService.del(cacheKey);
    } catch (error) {
      this.errorCount++;
      logger.error(`Cache: INVALIDATE error for key ${key}`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Invalidate all keys matching a pattern
   */
  async invalidatePattern(pattern: string, options?: CacheOptions): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (!redisService.getConnectionStatus()) {
      return;
    }

    try {
      const basePattern = this.buildKey(pattern, options);
      const keys = await redisService.keys(basePattern);
      
      if (keys.length === 0) {
        return;
      }

      // Delete all matching keys
      for (const key of keys) {
        await redisService.del(key);
      }
    } catch (error) {
      this.errorCount++;
      logger.error(`Cache: INVALIDATE_PATTERN error for pattern ${pattern}`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Check if a key exists in cache
   */
  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    if (!redisService.getConnectionStatus()) {
      return false;
    }

    try {
      const cacheKey = this.buildKey(key, options);
      return await redisService.exists(cacheKey);
    } catch (error) {
      this.errorCount++;
      logger.error(`Cache: EXISTS error for key ${key}`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Get or set pattern - useful for caching expensive operations
   * Automatically handles cache misses by calling the fetcher function
   */
  async getOrSet<T = any>(
    key: string,
    fetcher: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - fetch from source
    const value = await fetcher();
    
    // Store in cache
    await this.set(key, value, options);
    
    return value;
  }

  /**
   * Invalidate factory-specific cache
   */
  async invalidateFactoryCache(factoryId: string, pattern?: string): Promise<void> {
    const invalidationPattern = pattern || '*';
    await this.invalidatePattern(invalidationPattern, { factoryId });
  }

  /**
   * Check if cache is enabled and connected
   */
  isEnabled(): boolean {
    return this.enabled && redisService.getConnectionStatus();
  }

  /**
   * Get cache performance metrics
   * Returns hit rate, miss rate, and error count
   */
  getMetrics(): {
    hits: number;
    misses: number;
    errors: number;
    hitRate: number;
    missRate: number;
    total: number;
  } {
    const total = this.hitCount + this.missCount;
    return {
      hits: this.hitCount,
      misses: this.missCount,
      errors: this.errorCount,
      hitRate: total > 0 ? (this.hitCount / total) * 100 : 0,
      missRate: total > 0 ? (this.missCount / total) * 100 : 0,
      total
    };
  }

  /**
   * Reset cache metrics (useful for testing or periodic reset)
   */
  resetMetrics(): void {
    this.hitCount = 0;
    this.missCount = 0;
    this.errorCount = 0;
  }
}

// Export singleton instance
export const cacheService = new CacheService();
export default cacheService;

