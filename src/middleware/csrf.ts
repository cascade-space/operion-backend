import { Request, Response, NextFunction } from 'express';
import csrf from 'csurf';
import { ApiResponse } from '@/types';
import logger from '@/utils/logger';

// CSRF protection middleware
// Uses cookie-based CSRF tokens (more secure than session-based)
const csrfProtection = csrf({ cookie: true });

// Middleware to add CSRF token to response cookie
// This must run on all requests to set/refresh the CSRF token cookie
export const csrfTokenMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // For GET requests, just generate and set the token
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    // Generate CSRF token
    csrfProtection(req, res, () => {
      // Set CSRF token in cookie for frontend to read
      if (req.csrfToken) {
        res.cookie('XSRF-TOKEN', req.csrfToken(), {
          httpOnly: false, // Must be false so JavaScript can read it
          secure: process.env.NODE_ENV === 'production', // HTTPS only in production
          sameSite: 'strict', // CSRF protection
          maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
      }
      next();
    });
    return;
  }
  
  // For other methods, validate CSRF token
  csrfProtection(req, res, (err) => {
    if (err) {
      logger.warn('CSRF token validation failed', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        error: err instanceof Error ? err.message : String(err)
      });
      
      const response: ApiResponse = {
        success: false,
        error: 'Invalid CSRF token. Please refresh the page and try again.',
        status: 403
      };
      
      res.status(403).json(response);
      return;
    }
    
    // Update CSRF token cookie after successful validation
    if (req.csrfToken) {
      res.cookie('XSRF-TOKEN', req.csrfToken(), {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000
      });
    }
    
    next();
  });
};

// CSRF protection middleware for API routes
// Skip CSRF for GET, HEAD, OPTIONS requests (read-only operations)
export const csrfProtectionMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Skip CSRF for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  
  // Skip CSRF for health check endpoint
  if (req.path === '/health') {
    next();
    return;
  }
  
  // Apply CSRF protection
  csrfProtection(req, res, (err) => {
    if (err) {
      logger.warn('CSRF token validation failed', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        error: err instanceof Error ? err.message : String(err)
      });
      
      const response: ApiResponse = {
        success: false,
        error: 'Invalid CSRF token. Please refresh the page and try again.',
        status: 403
      };
      
      res.status(403).json(response);
      return;
    }
    
    next();
  });
};


