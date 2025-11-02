import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { ApiResponse } from '@/types';

// Validation result handler
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => error.msg);
    
    const response: ApiResponse = {
      success: false,
      error: errorMessages.join(', '),
      status: 400
    };
    
    res.status(400).json(response);
    return;
  }
  
  next();
};

// Auth validation rules
export const loginValidation = [
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('userId')
    .optional()
    .isLength({ min: 3 })
    .withMessage('User ID must be at least 3 characters long'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  // Custom validation to ensure either email or userId is provided
  (req: any, res: any, next: any) => {
    if (!req.body.email && !req.body.userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Either email or User ID is required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }
    next();
  },
  handleValidationErrors
];

export const registerValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('profile.firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('profile.lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('profile.phone')
    .matches(/^\+?[\d\s-()]+$/)
    .withMessage('Please provide a valid phone number')
    .custom((value) => {
      const cleanPhone = value.replace(/\D/g, '');
      if (cleanPhone.length < 5) {
        throw new Error('Phone number must have at least 5 digits for ID generation');
      }
      return true;
    }),
  handleValidationErrors
];

// Factory validation rules
export const factoryValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Factory name must be between 2 and 100 characters'),
  body('address.street')
    .trim()
    .notEmpty()
    .withMessage('Street address is required'),
  body('address.city')
    .trim()
    .notEmpty()
    .withMessage('City is required'),
  body('address.state')
    .trim()
    .notEmpty()
    .withMessage('State is required'),
  body('address.country')
    .trim()
    .notEmpty()
    .withMessage('Country is required'),
  body('address.zipCode')
    .trim()
    .notEmpty()
    .withMessage('ZIP code is required'),
  body('geofence.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('geofence.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  body('geofence.radius')
    .isFloat({ min: 10, max: 1000 })
    .withMessage('Geofence radius must be between 10 and 1000 meters'),
  handleValidationErrors
];

// User validation rules
export const userValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('role')
    .isIn(['super_admin', 'factory_admin', 'supervisor', 'employee'])
    .withMessage('Invalid role specified'),
  body('profile.firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('profile.lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('profile.phone')
    .matches(/^\+?[\d\s-()]+$/)
    .withMessage('Please provide a valid phone number')
    .custom((value) => {
      const cleanPhone = value.replace(/\D/g, '');
      if (cleanPhone.length < 5) {
        throw new Error('Phone number must have at least 5 digits for ID generation');
      }
      return true;
    }),
  handleValidationErrors
];

// Product validation rules
export const productValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Product name must be between 2 and 100 characters'),
  body('code')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Product code must be between 1 and 20 characters')
    .matches(/^[A-Z0-9]+$/)
    .withMessage('Product code must contain only uppercase letters and numbers'),
  body('category')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Category must be between 2 and 50 characters'),
  body('inventory.currentStock')
    .isInt({ min: 0 })
    .withMessage('Current stock must be a non-negative integer'),
  body('inventory.minStock')
    .isInt({ min: 0 })
    .withMessage('Minimum stock must be a non-negative integer'),
  body('inventory.unit')
    .trim()
    .notEmpty()
    .withMessage('Inventory unit is required'),
  handleValidationErrors
];

// Process validation rules
export const processValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Process name must be between 2 and 100 characters'),
  body('stage')
    .isInt({ min: 1 })
    .withMessage('Stage must be a positive integer'),
  body('targetPerHour')
    .isFloat({ min: 1 })
    .withMessage('Target per hour must be a positive number'),
  body('specifications.complexity')
    .optional()
    .isIn(['low', 'medium', 'high'])
    .withMessage('Complexity must be low, medium, or high'),
  body('specifications.skillLevel')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Skill level must be beginner, intermediate, or advanced'),
  handleValidationErrors
];

// Simplified process validation (for new structure)
export const validateProcess = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Process name is required and must be between 1 and 100 characters'),
  body('productId')
    .isMongoId()
    .withMessage('Valid product ID is required'),
  handleValidationErrors
];


// Machine validation
export const validateMachine = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Machine name is required and must be between 1 and 50 characters'),
  body('sizeId')
    .isMongoId()
    .withMessage('Valid size ID is required'),
  handleValidationErrors
];

// Attendance validation rules
export const attendanceValidation = [
  body('shiftType')
    .isIn(['morning', 'evening', 'night'])
    .withMessage('Shift type must be morning, evening, or night'),
  body('target')
    .isFloat({ min: 0 })
    .withMessage('Target must be a non-negative number'),
  body('checkIn.location.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('checkIn.location.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  handleValidationErrors
];

// Work entry validation rules
export const workEntryValidation = [
  body('achieved')
    .isInt({ min: 0 })
    .withMessage('Achieved quantity must be a non-negative integer'),
  body('rejected')
    .isInt({ min: 0 })
    .withMessage('Rejected quantity must be a non-negative integer'),
  body('photo')
    .notEmpty()
    .withMessage('Photo is required'),
  handleValidationErrors
];

// ID parameter validation
export const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID format'),
  handleValidationErrors
];

// Pagination validation
export const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  handleValidationErrors
];

// Date range validation
export const dateRangeValidation = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  handleValidationErrors
];

// Search validation
export const searchValidation = [
  query('search')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Search term must be at least 2 characters long'),
  handleValidationErrors
];

// File upload validation
export const fileUploadValidation = [
  body('file')
    .custom((value, { req }) => {
      if (!req.file) {
        throw new Error('File is required');
      }
      
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(req.file.mimetype)) {
        throw new Error('Only JPEG, PNG, and WebP images are allowed');
      }
      
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (req.file.size > maxSize) {
        throw new Error('File size must be less than 5MB');
      }
      
      return true;
    }),
  handleValidationErrors
];
