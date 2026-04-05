import { Router } from 'express';
import { getOrgUsers, deleteOrgUser } from '../controllers/org.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';

const router = Router();

router.use(protect, requireRole('editor', 'admin'));

router.get('/users', getOrgUsers);
router.delete('/users/:id', deleteOrgUser);

export default router;
