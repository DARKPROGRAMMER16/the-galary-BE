import { Router } from 'express';
import {
  uploadVideo,
  getVideos,
  getVideoById,
  updateVideo,
  deleteVideo,
  assignVideo,
  getStats,
} from '../controllers/video.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import upload from '../config/multer.js';

const router = Router();

router.use(protect);

// Read — all authenticated roles
router.get('/stats', getStats);
router.get('/', getVideos);
router.get('/:id', getVideoById);

// Write — editor, admin, and superadmin
router.post('/', requireRole('editor', 'admin', 'superadmin'), upload.single('video'), uploadVideo);
router.patch('/:id/assign', requireRole('editor', 'admin', 'superadmin'), assignVideo);
router.patch('/:id', requireRole('editor', 'admin', 'superadmin'), updateVideo);
router.delete('/:id', requireRole('editor', 'admin', 'superadmin'), deleteVideo);

export default router;
