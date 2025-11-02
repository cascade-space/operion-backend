import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserDocument } from '@/models/User';
import { FactoryDocument } from '@/models/Factory';
import { AuthenticatedRequest, JWTPayload, UserRole } from '@/types';
import User from '@/models/User';
import Factory from '@/models/Factory';
import cacheService from '@/services/cacheService';
import tokenBlacklistService from '@/services/tokenBlacklistService';
import env from '@/config/env';
import logger from '@/utils/logger';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: UserDocument;
      factoryId?: string;
    }
  }
}

export interface AuthRequest extends Request {
  user?: UserDocument;
  factoryId?: string;
}

// Verify JWT token
export const verifyToken = (token: string): JWTPayload => {
  // env validation ensures JWT_SECRET exists
  return jwt.verify(token, env.JWT_SECRET) as JWTPayload;
};

// Verify refresh token
export const verifyRefreshToken = async (token: string): Promise<JWTPayload> => {
  // env validation ensures JWT_REFRESH_SECRET exists
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as JWTPayload;
  
  // Check if refresh token is blacklisted
  const isBlacklisted = await tokenBlacklistService.isTokenBlacklisted(token, decoded);
  if (isBlacklisted) {
    throw new Error('Refresh token has been revoked');
  }
  
  return decoded;
};

// Generate access token
export const generateAccessToken = (payload: Omit<JWTPayload, 'type'>): string => {
  // env validation ensures JWT_SECRET exists
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as any);
};

// Generate refresh token
export const generateRefreshToken = (payload: Omit<JWTPayload, 'type'>): string => {
  // env validation ensures JWT_REFRESH_SECRET exists
  return jwt.sign({ ...payload, type: 'refresh' }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as any);
};

// Authentication middleware
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Access token required',
        status: 401
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
      const decoded = verifyToken(token);
      
      if (decoded.type !== 'access') {
        res.status(401).json({
          success: false,
          error: 'Invalid token type',
          status: 401
        });
        return;
      }

      // Check if token is blacklisted
      const isBlacklisted = await tokenBlacklistService.isTokenBlacklisted(token, decoded);
      if (isBlacklisted) {
        res.status(401).json({
          success: false,
          error: 'Token has been revoked',
          status: 401
        });
        return;
      }

      // Try to get user from cache first
      const cacheKey = `user:${decoded.userId}`;
      let user = await cacheService.get<UserDocument>(cacheKey);
      
      if (!user) {
        // Cache miss - fetch from database
        user = await User.findById(decoded.userId).select('-password');
        
        if (user && user.isActive) {
          // Cache user data for 15 minutes (align with access token expiry)
          await cacheService.set(cacheKey, user, { ttl: 900 });
        }
      }
      
      if (!user || !user.isActive) {
        res.status(401).json({
          success: false,
          error: 'User not found or inactive',
          status: 401
        });
        return;
      }

      req.user = user;
      req.factoryId = decoded.factoryId;
      
      next();
    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        status: 401
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Authentication error',
      status: 500
    });
  }
};

// Role-based authorization middleware
export const authorize = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      logger.debug('Authorization failed: No user found');
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        status: 401
      });
      return;
    }

    logger.debug('Authorization check', {
      userRole: req.user.role,
      allowedRoles: roles,
      hasPermission: roles.includes(req.user.role)
    });

    if (!roles.includes(req.user.role)) {
      logger.debug('Authorization failed: Insufficient permissions');
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        status: 403
      });
      return;
    }

    next();
  };
};

// Factory access middleware
export const requireFactoryAccess = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        status: 401
      });
      return;
    }

    // Super admin can access all factories
    if (req.user.role === 'super_admin') {
      next();
      return;
    }

    // Other users must have a factoryId
    if (!req.user.factoryId) {
      res.status(403).json({
        success: false,
        error: 'Factory access required',
        status: 403
      });
      return;
    }

    // Check if factory exists and is active
    const factory = await Factory.findById(req.user.factoryId);
    if (!factory || !factory.isActive) {
      res.status(403).json({
        success: false,
        error: 'Factory not found or inactive',
        status: 403
      });
      return;
    }

    req.factoryId = req.user.factoryId.toString();
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Factory access verification error',
      status: 500
    });
  }
};

// Super admin only middleware
export const requireSuperAdmin = authorize('super_admin');

// Factory admin only middleware
export const requireFactoryAdmin = authorize('factory_admin');

// Supervisor only middleware
export const requireSupervisor = authorize('supervisor');

// Employee only middleware
export const requireEmployee = authorize('employee');

// Admin or supervisor middleware
export const requireAdminOrSupervisor = authorize('factory_admin', 'supervisor');

// Optional authentication middleware (doesn't fail if no token)
export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = verifyToken(token);
      
      if (decoded.type === 'access') {
        // Check if token is blacklisted
        const isBlacklisted = await tokenBlacklistService.isTokenBlacklisted(token, decoded);
        if (!isBlacklisted) {
          const user = await User.findById(decoded.userId).select('-password');
          
          if (user && user.isActive) {
            req.user = user;
            req.factoryId = decoded.factoryId;
          }
        }
      }
    } catch (error) {
      // Token is invalid, but we continue without authentication
    }
    
    next();
  } catch (error) {
    next();
  }
};
