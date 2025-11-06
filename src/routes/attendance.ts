import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, authorize } from '@/middleware/auth';
import { validateMongoId } from '@/middleware/commonValidation';
import { handleValidationErrors } from '@/middleware/validation';
import {
  getAllAttendance,
  getAttendanceById,
  getAttendanceByEmployee,
  getAttendanceHistory,
  getTodayAttendance,
  getTodayAttendanceList,
  checkIn,
  checkOut,
  updateAttendanceStatus,
  createManualAttendance,
  deleteAttendance,
  markAbsent
} from '@/controllers/attendanceController';

const router: Router = Router();

// Validation middleware
const validateAttendance = [
  body('processId').optional().custom((value) => {
    if (value && value !== '') {
      return /^[0-9a-fA-F]{24}$/.test(value);
    }
    return true;
  }).withMessage('Valid process ID is required'),
  body('location.latitude').isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('location.longitude').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
];

// Routes
router.get('/', authenticate, getAllAttendance);
router.get('/today/list', authenticate, getTodayAttendanceList);
router.get('/today/:employeeId', authenticate, getTodayAttendance);
router.get('/employee/:employeeId', authenticate, [
  param('employeeId').isMongoId().withMessage('Invalid employee ID format'),
  handleValidationErrors
], getAttendanceByEmployee);
router.get('/employee/:employeeId/history', authenticate, [
  param('employeeId').isMongoId().withMessage('Invalid employee ID format'),
  handleValidationErrors
], getAttendanceHistory);
router.get('/:id', authenticate, validateMongoId, getAttendanceById);

router.post('/check-in', authenticate, authorize('employee'), validateAttendance, checkIn);
router.post('/:id/check-out', authenticate, authorize('employee'), validateMongoId, validateAttendance, checkOut);
router.post('/manual', authenticate, authorize('super_admin', 'factory_admin'), validateAttendance, createManualAttendance);
router.post('/mark-absent', authenticate, authorize('super_admin', 'factory_admin', 'supervisor'), markAbsent);

router.patch('/:id/status', authenticate, authorize('super_admin', 'factory_admin', 'supervisor'), validateMongoId, updateAttendanceStatus);

router.delete('/:id', authenticate, authorize('super_admin', 'factory_admin'), validateMongoId, deleteAttendance);

export default router;
