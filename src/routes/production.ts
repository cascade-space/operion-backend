import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import {
  checkIn,
  getProcessStagesByProduct,
  getProcessStatus,
  submitProduction
} from '@/controllers/productionController';

const router: Router = Router();

// Check-in endpoint
router.post('/checkin', authenticate, checkIn as any);

// Get process stages for a product
router.get('/process-stages', authenticate, getProcessStagesByProduct as any);

// Get process status (available quantity)
router.get('/process-status', authenticate, getProcessStatus as any);

// Submit production entry
router.post('/submit', authenticate, authorize('employee'), submitProduction as any);

export default router;

