import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import {
  getDashboardStats,
  getProductionStats,
  testEndpoint,
  getProcessesWithStats,
  getProductionSummary,
  getEfficiencyStats,
  getAttendanceStats,
  getRejectionStats
} from '@/controllers/dashboardController';

const router: Router = Router();

// Routes
router.get('/stats', authenticate, getDashboardStats);
router.get('/production', authenticate, getProductionStats);
router.get('/production-summary', authenticate, getProductionSummary);
router.get('/efficiency', authenticate, getEfficiencyStats);
router.get('/attendance', authenticate, getAttendanceStats);
router.get('/rejections', authenticate, getRejectionStats);
router.get('/processes-with-stats', authenticate, getProcessesWithStats);
router.get('/test', authenticate, testEndpoint);

export default router;
