import { Router } from 'express';
import { body } from 'express-validator';
import mongoose from 'mongoose';
import Factory from '@/models/Factory';
import User from '@/models/User';
import { ApiResponse } from '@/types';
import bcrypt from 'bcryptjs';
import { authenticate, authorize } from '@/middleware/auth';
import { validateMongoId } from '@/middleware/commonValidation';
import { handleValidationErrors } from '@/middleware/validation';
import { sanitizeFactoryInput } from '@/middleware/sanitization';
import {
  registerFactory,
  getFactoryRequests,
  approveFactoryRequest,
  rejectFactoryRequest,
  createFactory,
  getAllFactories,
  getShifts,
  getFactoryById,
  updateFactory,
  deleteFactory,
  approveFactory,
  suspendFactory,
  addShift,
  updateShift,
  deleteShift
} from '@/controllers/factoryController';
import logger from '@/utils/logger';

const router: Router = Router();

// Validation middleware
const validateFactoryRegistration = [
  body('name').isLength({ min: 2 }).withMessage('Factory name must be at least 2 characters'),
  body('address.street').isLength({ min: 5 }).withMessage('Street address is required'),
  body('address.city').isLength({ min: 2 }).withMessage('City is required'),
  body('address.state').isLength({ min: 2 }).withMessage('State is required'),
  body('address.country').isLength({ min: 2 }).withMessage('Country is required'),
  body('address.zipCode').isLength({ min: 5 }).withMessage('ZIP code is required'),
  body('geofence.latitude').isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('geofence.longitude').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  body('geofence.radius').isInt({ min: 50, max: 1000 }).withMessage('Radius must be between 50-1000 meters'),
  body('adminEmail').isEmail().withMessage('Invalid admin email'),
  body('adminProfile.firstName').isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
  body('adminProfile.lastName').isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
  body('adminProfile.phone').isLength({ min: 10 }).withMessage('Phone number must be at least 10 digits'),
  body('adminCredentials.username').isEmail().withMessage('Username must be a valid email address'),
  body('adminCredentials.password').isLength({ min: 1 }).withMessage('Password is required'),
];

const validateShift = [
  body('name').isLength({ min: 1 }).withMessage('Shift name is required'),
  body('startTime').matches(/^(1[0-2]|0?[1-9]):[0-5][0-9]\s?(AM|PM)$/i).withMessage('Start time must be in 12-hour format (e.g., 9:00 AM)'),
  body('endTime').matches(/^(1[0-2]|0?[1-9]):[0-5][0-9]\s?(AM|PM)$/i).withMessage('End time must be in 12-hour format (e.g., 5:00 PM)'),
  body('isActive').isBoolean().withMessage('isActive must be a boolean')
];

const validateShiftUpdate = [
  body('name').optional().isLength({ min: 1 }).withMessage('Shift name is required'),
  body('startTime').optional().matches(/^(1[0-2]|0?[1-9]):[0-5][0-9]\s?(AM|PM)$/i).withMessage('Start time must be in 12-hour format (e.g., 9:00 AM)'),
  body('endTime').optional().matches(/^(1[0-2]|0?[1-9]):[0-5][0-9]\s?(AM|PM)$/i).withMessage('End time must be in 12-hour format (e.g., 5:00 PM)'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
];

// Main routes
router.post('/register', sanitizeFactoryInput, validateFactoryRegistration, registerFactory);
router.get('/requests', authenticate, authorize('super_admin'), getFactoryRequests);
router.post('/requests/:requestId/approve', authenticate, authorize('super_admin'), approveFactoryRequest);
router.post('/requests/:requestId/reject', authenticate, authorize('super_admin'), rejectFactoryRequest);
router.post('/', authenticate, authorize('super_admin'), sanitizeFactoryInput, createFactory);
// Validation middleware for geofence updates
const validateGeofenceUpdate = [
  body('geofence.latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('geofence.longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  body('geofence.radius').optional().isInt({ min: 50, max: 1000 }).withMessage('Radius must be between 50-1000 meters'),
];

router.get('/', getAllFactories);
router.get('/shifts', authenticate, getShifts);
router.get('/:id', validateMongoId, getFactoryById);
router.put('/:id', authenticate, validateMongoId, validateGeofenceUpdate, handleValidationErrors, updateFactory);
router.delete('/:id', validateMongoId, deleteFactory);
router.patch('/:id/approve', validateMongoId, approveFactory);
router.patch('/:id/suspend', validateMongoId, suspendFactory);

// Shift management routes
router.post('/shifts', authenticate, validateShift, addShift);
router.put('/shifts/:shiftName', authenticate, validateShiftUpdate, updateShift);
router.delete('/shifts/:shiftName', authenticate, deleteShift);

// Test endpoint to verify password hashing (remove in production)
router.post('/test-password', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    // Test bcrypt hashing
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Test password comparison
    const isMatch = await bcrypt.compare(password, hashedPassword);
    
    res.json({
      originalPassword: password,
      hashedPassword: hashedPassword,
      passwordLength: hashedPassword.length,
      startsWithHash: hashedPassword.startsWith('$2'),
      comparisonResult: isMatch
    });
  } catch (error) {
    res.status(500).json({ error: 'Test failed' });
  }
});

export default router;
