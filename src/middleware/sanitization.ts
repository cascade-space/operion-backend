import { Request, Response, NextFunction } from 'express';
import { sanitizeText, sanitizeObject } from '@/utils/sanitize';
import logger from '@/utils/logger';

/**
 * Middleware to sanitize user inputs to prevent XSS attacks
 * Sanitizes common text fields in request body
 */
export const sanitizeInput = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (req.body && typeof req.body === 'object') {
        // Sanitize specified fields
        req.body = sanitizeObject(req.body, fields);
      }
      
      // Also sanitize query parameters if they contain text
      if (req.query && typeof req.query === 'object') {
        for (const key in req.query) {
          if (typeof req.query[key] === 'string') {
            req.query[key] = sanitizeText(req.query[key] as string);
          }
        }
      }
      
      next();
    } catch (error) {
      logger.error('Input sanitization error', {
        error: error instanceof Error ? error.message : String(error),
        path: req.path
      });
      // Continue even if sanitization fails (don't block request)
      next();
    }
  };
};

/**
 * Predefined sanitization middleware for common routes
 */
export const sanitizeUserInput = sanitizeInput([
  'profile.firstName',
  'profile.lastName',
  'email',
  'username'
]);

export const sanitizeProductInput = sanitizeInput([
  'name',
  'code',
  'category',
  'description'
]);

export const sanitizeProcessInput = sanitizeInput([
  'name',
  'description',
  'machineNumber'
]);

export const sanitizeFactoryInput = sanitizeInput([
  'name',
  'address.street',
  'address.city',
  'address.state',
  'address.country',
  'address.zipCode'
]);

export const sanitizeWorkEntryInput = sanitizeInput([
  'validationNotes',
  'reasonForLessProduction'
]);

