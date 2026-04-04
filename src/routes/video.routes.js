import { Router } from 'express';
import {
  uploadVideo,
  getVideos,
  getVideoById,
  updateVideo,
  deleteVideo,
  getStats,
  uploadValidation,
} from '../controllers/video.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validate.middleware.js';

const router = Router();

// All video routes require a logged-in user
router.use(protect);

// Read — all authenticated roles
router.get('/stats', getStats);
router.get('/', getVideos);
router.get('/:id', getVideoById);

// Write — editor and admin only
router.post(
  '/',
  requireRole('editor', 'admin'),
  uploadValidation,
  validate,
  uploadVideo
);
router.patch('/:id', requireRole('editor', 'admin'), updateVideo);
router.delete('/:id', requireRole('editor', 'admin'), deleteVideo);

export default router;
