import { Router } from 'express';
import {
  register,
  login,
  googleAuth,
  me,
  updateProfile,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.post('/google', asyncHandler(googleAuth));
router.get('/me', requireAuth, asyncHandler(me));
router.patch('/me', requireAuth, asyncHandler(updateProfile));
router.post('/verify-email', requireAuth, asyncHandler(verifyEmail));
router.post('/resend-verification', requireAuth, asyncHandler(resendVerification));
router.post('/forgot-password', asyncHandler(forgotPassword));
router.post('/reset-password', asyncHandler(resetPassword));

export default router;
