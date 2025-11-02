import redisService from './redisService';
import { JWTPayload } from '@/types';

interface TokenBlacklistEntry {
  jti?: string;
  userId: string;
  type: 'access' | 'refresh';
  expiresAt: number;
}

class TokenBlacklistService {
  private enabled: boolean;

  constructor() {
    // Blacklist is enabled if Redis is available
    this.enabled = redisService.getConnectionStatus();
  }

  /**
   * Generate a token ID (jti) from token payload
   * If token has jti, use it; otherwise generate a deterministic ID
   */
  private getTokenId(token: string, decoded: JWTPayload): string {
    // If token already has jti, use it
    if ('jti' in decoded && decoded.jti) {
      return decoded.jti as string;
    }
    
    // Generate deterministic ID from token contents
    // Use userId + iat + type to create unique identifier
    const tokenString = `${decoded.userId}:${decoded.iat}:${decoded.type}`;
    // Simple hash function (not cryptographic, just for uniqueness)
    let hash = 0;
    for (let i = 0; i < tokenString.length; i++) {
      const char = tokenString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `token:${Math.abs(hash).toString(36)}`;
  }

  /**
   * Calculate TTL for blacklisted token based on expiry
   */
  private calculateTTL(exp: number): number {
    const now = Math.floor(Date.now() / 1000);
    const ttl = exp - now;
    // Return TTL in seconds, with a buffer of 60 seconds
    return Math.max(ttl, 60);
  }

  /**
   * Blacklist a token
   */
  async blacklistToken(token: string, decoded: JWTPayload): Promise<void> {
    if (!this.enabled || !redisService.getConnectionStatus()) {
      console.warn('Token blacklist: Redis not available, token blacklisting skipped');
      return;
    }

    try {
      const tokenId = this.getTokenId(token, decoded);
      const exp = decoded.exp || Math.floor(Date.now() / 1000) + 3600; // Default 1 hour if no exp
      const ttl = this.calculateTTL(exp);

      // Store token ID in blacklist with TTL
      const blacklistKey = `blacklist:token:${tokenId}`;
      await redisService.setex(blacklistKey, ttl, JSON.stringify({
        userId: decoded.userId,
        type: decoded.type,
        expiresAt: exp,
        blacklistedAt: Math.floor(Date.now() / 1000)
      }));

      console.log(`Token blacklisted: ${tokenId} (TTL: ${ttl}s)`);
    } catch (error) {
      console.error('Token blacklist: Error blacklisting token:', error);
      // Don't throw - blacklisting failure shouldn't break the app
    }
  }

  /**
   * Check if a token is blacklisted
   */
  async isTokenBlacklisted(token: string, decoded: JWTPayload): Promise<boolean> {
    if (!this.enabled || !redisService.getConnectionStatus()) {
      return false; // If Redis is not available, assume token is not blacklisted
    }

    try {
      const tokenId = this.getTokenId(token, decoded);
      const blacklistKey = `blacklist:token:${tokenId}`;
      const exists = await redisService.exists(blacklistKey);
      return exists;
    } catch (error) {
      console.error('Token blacklist: Error checking blacklist:', error);
      // On error, assume token is not blacklisted (fail open)
      return false;
    }
  }

  /**
   * Blacklist a token family (for refresh token rotation)
   * Stores a family identifier that can invalidate all related tokens
   */
  async blacklistTokenFamily(familyId: string, ttl: number): Promise<void> {
    if (!this.enabled || !redisService.getConnectionStatus()) {
      return;
    }

    try {
      const familyKey = `blacklist:family:${familyId}`;
      await redisService.setex(familyKey, ttl, '1');
      console.log(`Token family blacklisted: ${familyId} (TTL: ${ttl}s)`);
    } catch (error) {
      console.error('Token blacklist: Error blacklisting token family:', error);
    }
  }

  /**
   * Check if a token family is blacklisted
   */
  async isTokenFamilyBlacklisted(familyId: string): Promise<boolean> {
    if (!this.enabled || !redisService.getConnectionStatus()) {
      return false;
    }

    try {
      const familyKey = `blacklist:family:${familyId}`;
      return await redisService.exists(familyKey);
    } catch (error) {
      console.error('Token blacklist: Error checking family blacklist:', error);
      return false;
    }
  }

  /**
   * Extract token family ID from refresh token
   * For now, we'll use userId + a timestamp component
   * In future, this could be stored in token payload
   */
  extractTokenFamilyId(decoded: JWTPayload): string {
    // Use userId + iat as family identifier
    // This groups all tokens issued at the same time for the same user
    return `family:${decoded.userId}:${decoded.iat || 'unknown'}`;
  }

  /**
   * Clear all blacklisted tokens for a user (useful for password reset, account lockout)
   */
  async clearUserTokens(userId: string): Promise<void> {
    if (!this.enabled || !redisService.getConnectionStatus()) {
      return;
    }

    try {
      // Find all blacklisted tokens for this user
      const pattern = `blacklist:token:token:*`;
      const keys = await redisService.keys(pattern);
      
      // Filter keys that belong to this user and delete them
      for (const key of keys) {
        const value = await redisService.get(key);
        if (value) {
          try {
            const entry: TokenBlacklistEntry = JSON.parse(value);
            if (entry.userId === userId) {
              await redisService.del(key);
            }
          } catch {
            // Skip invalid entries
          }
        }
      }
      
      console.log(`Cleared blacklisted tokens for user: ${userId}`);
    } catch (error) {
      console.error('Token blacklist: Error clearing user tokens:', error);
    }
  }

  /**
   * Check if blacklist service is enabled and available
   */
  isEnabled(): boolean {
    return this.enabled && redisService.getConnectionStatus();
  }
}

// Export singleton instance
export const tokenBlacklistService = new TokenBlacklistService();
export default tokenBlacklistService;

