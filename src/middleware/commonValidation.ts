import { param, query } from 'express-validator';
import { handleValidationErrors } from './validation';

/**
 * Common validation middleware
 * Reusable validation chains for common use cases
 */

/**
 * Validate MongoDB ObjectId in route parameters
 */
export const validateMongoId = [
  param('id').isMongoId().withMessage('Invalid ID format'),
  handleValidationErrors
];

/**
 * Validate pagination query parameters
 */
export const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  handleValidationErrors
];

/**
 * Validate date range query parameters
 */
export const validateDateRange = [
  query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
  handleValidationErrors
];

// Re-export validationResult for convenience (alias for handleValidationErrors)
export const validationResult = handleValidationErrors;

