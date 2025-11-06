import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import {
  checkIn,
  getProcessStagesByProduct,
  getProcessStatus,
  submitProduction
} from '@/controllers/productionController';

const router = Router();

// Check-in endpoint
router.post('/checkin', authenticate, checkIn);

// Get process stages for a product
router.get('/process-stages', authenticate, getProcessStagesByProduct);

// Get process status (available quantity)
router.get('/process-status', authenticate, getProcessStatus);

// Submit production entry
router.post('/submit', authenticate, authorize('employee'), submitProduction);

export default router;

