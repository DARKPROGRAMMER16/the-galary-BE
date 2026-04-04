import { Router } from 'express';
import {
  getAllUsers,
  updateUserRole,
  toggleUserStatus,
  deleteUser,
} from '../controllers/admin.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';

const router = Router();

// Every admin route requires auth + admin role
router.use(protect, requireRole('admin'));

router.get('/users', getAllUsers);
router.patch('/users/:id/role', updateUserRole);
router.patch('/users/:id/toggle', toggleUserStatus);
router.delete('/users/:id', deleteUser);

export default router;
