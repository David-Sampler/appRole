import { Router } from 'express';
import { paymentWebhook, connectMercadoPago, mercadoPagoCallback } from '../controllers/payment.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.post('/webhook', asyncHandler(paymentWebhook));
router.get('/mp/connect', requireAuth, requireRole('organizer'), asyncHandler(connectMercadoPago));
router.get('/mp/callback', asyncHandler(mercadoPagoCallback));

export default router;
