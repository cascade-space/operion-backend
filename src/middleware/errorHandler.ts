import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/types';
import logger from '@/utils/logger';
import { captureException } from '@/utils/sentry';

/**
 * Centralized error handling middleware
 */
export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  logger.error('Error:', {
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Send to Sentry for tracking
  if (error.statusCode >= 500 || !error.statusCode) {
    captureException(error instanceof Error ? error : new Error(error.message), {
      request: {
        url: req.url,
        method: req.method,
        headers: {
          'user-agent': req.headers['user-agent'],
        },
      },
      user: (req as any).user ? {
        id: (req as any).user._id?.toString(),
        role: (req as any).user.role,
      } : undefined,
    });
  }

  // Determine status code
  let statusCode = 500;
  let errorMessage = 'Internal server error';

  if (error.statusCode) {
    statusCode = error.statusCode;
    errorMessage = error.message;
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    errorMessage = error.message || 'Validation error';
  } else if (error.name === 'UnauthorizedError' || error.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorMessage = 'Unauthorized';
  } else if (error.name === 'CastError') {
    statusCode = 400;
    errorMessage = 'Invalid ID format';
  } else if (error.message) {
    errorMessage = error.message;
  }

  // In production, don't expose error details
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    errorMessage = 'Internal server error';
  }

  const response: ApiResponse = {
    success: false,
    error: errorMessage,
    status: statusCode
  };

  res.status(statusCode).json(response);
};

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Request timeout middleware
 */
export const timeoutMiddleware = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({
          success: false,
          error: 'Request timeout',
          status: 504
        });
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    next();
  };
};

export default errorHandler;

