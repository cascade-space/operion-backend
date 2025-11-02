import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, authorize } from '@/middleware/auth';
import { validateMongoId } from '@/middleware/commonValidation';
import { handleValidationErrors } from '@/middleware/validation';
import {
  testEndpoint,
  getActiveWorkEntry,
  getAllWorkEntries,
  getWorkEntryById,
  startWork,
  directWorkEntry,
  completeWork,
  deleteWorkEntry,
  getWorkEntriesByEmployee,
  getWorkEntryHistory,
  getPendingValidations,
  validateWorkEntry,
  updateProduction,
  getPendingValidationsList,
  getProductReport,
  getEmployeeDailySummary
} from '@/controllers/workEntryController';

const router = Router();

// Validation middleware for starting work
const validateStartWork = [
  body('processId').isMongoId().withMessage('Valid process ID is required'),
  body('productId').isMongoId().withMessage('Valid product ID is required'),
  body('targetQuantity').isInt({ min: 1 }).withMessage('Target quantity must be a positive integer'),
  // Location validation removed - will be implemented later
];

// Validation middleware for completing work
const validateCompleteWork = [
  body('achieved').isInt({ min: 0 }).withMessage('Achieved must be a non-negative integer'),
  body('rejected').isInt({ min: 0 }).withMessage('Rejected must be a non-negative integer'),
  body('photo').isLength({ min: 1 }).withMessage('Work photo is required'),
  body('reasonForLessProduction').optional().isLength({ min: 1, max: 500 }).withMessage('Reason must be between 1 and 500 characters'),
];

// Routes
router.get('/test', testEndpoint);

router.get('/active', authenticate, getActiveWorkEntry);
router.get('/', authenticate, getAllWorkEntries);
router.get('/:id', authenticate, validateMongoId, getWorkEntryById);

router.post('/start', authenticate, startWork);
router.post('/direct', authenticate, authorize('employee'), directWorkEntry);
router.post('/complete/:id', authenticate, authorize('employee'), validateMongoId, validateCompleteWork, completeWork);
router.delete('/:id', authenticate, authorize('employee'), validateMongoId, deleteWorkEntry);

router.get('/employee/:employeeId', authenticate, [
  param('employeeId').isMongoId().withMessage('Invalid employee ID format'),
  handleValidationErrors
], getWorkEntriesByEmployee);
router.get('/employee/:employeeId/history', authenticate, [
  param('employeeId').isMongoId().withMessage('Invalid employee ID format'),
  handleValidationErrors
], getWorkEntryHistory);
router.get('/employee/:employeeId/daily-summary', authenticate, [
  param('employeeId').isMongoId().withMessage('Invalid employee ID format'),
  handleValidationErrors
], getEmployeeDailySummary);

router.get('/pending/list', authenticate, authorize('super_admin', 'factory_admin', 'supervisor'), getPendingValidations);
router.post('/:id/validate', authenticate, authorize('super_admin', 'factory_admin', 'supervisor'), validateMongoId, validateWorkEntry);
router.patch('/:id/production', authenticate, authorize('super_admin', 'factory_admin', 'supervisor'), validateMongoId, updateProduction);
router.get('/pending-validations', authenticate, authorize('super_admin', 'factory_admin', 'supervisor'), getPendingValidationsList);

router.get('/product-report/:productId', authenticate, authorize('super_admin', 'factory_admin', 'supervisor'), [
  param('productId').isMongoId().withMessage('Invalid product ID format'),
  handleValidationErrors
], getProductReport);

export default router;
