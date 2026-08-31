import { Router } from 'express';
import multer from 'multer';
import { uploadImage } from '../controllers/upload.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const router = Router();

router.post(
  '/event-image',
  requireAuth,
  requireRole('organizer'),
  upload.single('image'),
  asyncHandler(uploadImage)
);

export default router;
