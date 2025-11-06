import { Request, Response, NextFunction } from 'express';
import csrf from 'csurf';
import { ApiResponse } from '@/types';
import logger from '@/utils/logger';

// CSRF protection middleware
// Uses cookie-based CSRF tokens (more secure than session-based)
const csrfProtection = csrf({ cookie: true });

// List of public endpoints that don't require CSRF protection
const PUBLIC_ENDPOINTS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/factories/register',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/factories/register',
];

// Check if endpoint is public (doesn't require CSRF protection)
const isPublicEndpoint = (path: string): boolean => {
  return PUBLIC_ENDPOINTS.some(endpoint => path.startsWith(endpoint));
};

// Helper to get cookie options based on environment
const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isHTTPS = isProduction || process.env.FORCE_HTTPS === 'true';
  
  // For cross-origin requests in production (HTTPS), use 'none' with secure flag
  // For same-origin or development, 'lax' is sufficient
  // 'none' allows cookies to be sent with cross-origin requests (requires secure: true)
  const sameSite = isHTTPS ? ('none' as const) : ('lax' as const);
  
  return {
    httpOnly: false, // Must be false so JavaScript can read it
    secure: isHTTPS, // HTTPS only in production or when FORCE_HTTPS is set
    sameSite, // 'none' for cross-origin POST requests (requires HTTPS), 'lax' for same-origin
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/' // Set path to root so cookie is available for all routes
  };
};

// Middleware to add CSRF token to response cookie
// This must run on all requests to set/refresh the CSRF token cookie
export const csrfTokenMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Skip CSRF for public authentication endpoints
  if (isPublicEndpoint(req.path)) {
    // Still generate token for GET requests to public endpoints
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      csrfProtection(req, res, () => {
        if (req.csrfToken) {
          res.cookie('XSRF-TOKEN', req.csrfToken(), getCookieOptions());
        }
      });
    }
    next();
    return;
  }

  // For GET requests, just generate and set the token
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    // Generate CSRF token
    csrfProtection(req, res, () => {
      // Set CSRF token in cookie for frontend to read
      if (req.csrfToken) {
        res.cookie('XSRF-TOKEN', req.csrfToken(), getCookieOptions());
      }
      next();
    });
    return;
  }
  
  // For other methods, validate CSRF token
  csrfProtection(req, res, (err) => {
    if (err) {
      // Enhanced error logging for debugging
      const csrfTokenHeader = req.headers['x-xsrf-token'] || req.headers['x-csrf-token'] || req.headers['xsrf-token'] || req.headers['csrf-token'];
      const cookieToken = req.cookies?.['XSRF-TOKEN'];
      
      logger.warn('CSRF token validation failed', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        error: err instanceof Error ? err.message : String(err),
        hasHeaderToken: !!csrfTokenHeader,
        hasCookieToken: !!cookieToken,
        headerTokenLength: csrfTokenHeader ? String(csrfTokenHeader).length : 0,
        cookieTokenLength: cookieToken ? String(cookieToken).length : 0,
        origin: req.headers.origin,
        referer: req.headers.referer
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
      res.cookie('XSRF-TOKEN', req.csrfToken(), getCookieOptions());
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

  // Skip CSRF for public authentication endpoints
  if (isPublicEndpoint(req.path)) {
    next();
    return;
  }
  
  // Apply CSRF protection
  csrfProtection(req, res, (err) => {
    if (err) {
      // Enhanced error logging for debugging
      const csrfTokenHeader = req.headers['x-xsrf-token'] || req.headers['x-csrf-token'] || req.headers['xsrf-token'] || req.headers['csrf-token'];
      const cookieToken = req.cookies?.['XSRF-TOKEN'];
      
      logger.warn('CSRF token validation failed', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        error: err instanceof Error ? err.message : String(err),
        hasHeaderToken: !!csrfTokenHeader,
        hasCookieToken: !!cookieToken,
        headerTokenLength: csrfTokenHeader ? String(csrfTokenHeader).length : 0,
        cookieTokenLength: cookieToken ? String(cookieToken).length : 0,
        origin: req.headers.origin,
        referer: req.headers.referer
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
