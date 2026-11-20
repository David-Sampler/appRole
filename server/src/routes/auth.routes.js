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
import { loginLimiter, emailLimiter, codeLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/register', loginLimiter, asyncHandler(register));
router.post('/login', loginLimiter, asyncHandler(login));
router.post('/google', loginLimiter, asyncHandler(googleAuth));
router.get('/me', requireAuth, asyncHandler(me));
router.patch('/me', requireAuth, loginLimiter, asyncHandler(updateProfile));
router.post('/verify-email', requireAuth, codeLimiter, asyncHandler(verifyEmail));
router.post('/resend-verification', requireAuth, emailLimiter, asyncHandler(resendVerification));
router.post('/forgot-password', emailLimiter, asyncHandler(forgotPassword));
router.post('/reset-password', codeLimiter, asyncHandler(resetPassword));

export default router;
