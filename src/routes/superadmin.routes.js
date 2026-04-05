import { Router } from 'express';
import {
  getOrganisations,
  getOrgUsers,
  updateUserRole,
  toggleUserStatus,
  deleteUser,
  getOrgVideos,
  deleteVideo,
} from '../controllers/superadmin.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';

const router = Router();

router.use(protect, requireRole('superadmin'));

router.get('/organisations', getOrganisations);
router.get('/organisations/:org/users', getOrgUsers);
router.get('/organisations/:org/videos', getOrgVideos);
router.patch('/users/:id/role', updateUserRole);
router.patch('/users/:id/toggle', toggleUserStatus);
router.delete('/users/:id', deleteUser);
router.delete('/videos/:id', deleteVideo);

export default router;
