import { Router } from 'express';
import {
  listEvents,
  getEvent,
  myEvents,
  createEvent,
  purchaseTicket,
  guestPurchase,
  eventBuyers,
} from '../controllers/event.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/', asyncHandler(listEvents));
router.get('/mine', requireAuth, requireRole('organizer'), asyncHandler(myEvents));
router.get('/:id', asyncHandler(getEvent));
router.get(
  '/:id/buyers',
  requireAuth,
  requireRole('organizer'),
  asyncHandler(eventBuyers)
);
router.post('/', requireAuth, requireRole('organizer'), asyncHandler(createEvent));
router.post(
  '/:id/purchase',
  requireAuth,
  requireRole('buyer'),
  asyncHandler(purchaseTicket)
);
router.post('/:id/guest-purchase', asyncHandler(guestPurchase));

export default router;
