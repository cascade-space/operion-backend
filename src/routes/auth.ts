import { Router } from 'express';
import { 
  login, 
  register, 
  refreshToken, 
  logout, 
  validateToken, 
  resetPasswordRequest, 
  resetPassword,
  getProfile,
  updateProfile,
  updatePassword
} from '@/controllers/authController';
import { 
  authenticate, 
  requireSuperAdmin 
} from '@/middleware/auth';
import { 
  loginValidation, 
  registerValidation 
} from '@/middleware/validation';

const router: Router = Router();

// Public routes
router.post('/login', loginValidation, login);
router.post('/refresh', refreshToken);
router.post('/reset-password-request', resetPasswordRequest);
router.post('/reset-password', resetPassword);

// Protected routes
router.post('/logout', authenticate, logout);
router.get('/validate', authenticate, validateToken);
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.put('/password', authenticate, updatePassword);

// Super admin only routes
router.post('/register', authenticate, requireSuperAdmin, registerValidation, register);

export default router;
