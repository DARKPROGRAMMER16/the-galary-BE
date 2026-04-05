import { Router } from 'express';
import {
  register,
  registerSuperAdmin,
  login,
  getMe,
  registerValidation,
  registerSuperAdminValidation,
  loginValidation,
} from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';

const router = Router();

// Public registration — organisation required, superadmin role blocked
router.post('/register', registerValidation, validate, register);

// Superadmin-only registration — gated by SUPERADMIN_SECRET env var
router.post('/register/superadmin', registerSuperAdminValidation, validate, registerSuperAdmin);

router.post('/login', loginValidation, validate, login);
router.get('/me', protect, getMe);

export default router;
