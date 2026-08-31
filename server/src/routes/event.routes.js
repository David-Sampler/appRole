import { Router } from 'express';
import {
  listEvents,
  getEvent,
  myEvents,
  createEvent,
  updateEvent,
  cancelEvent,
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
router.put('/:id', requireAuth, requireRole('organizer'), asyncHandler(updateEvent));
router.patch('/:id/cancel', requireAuth, requireRole('organizer'), asyncHandler(cancelEvent));
router.post(
  '/:id/purchase',
  requireAuth,
  requireRole('buyer'),
  asyncHandler(purchaseTicket)
);
router.post('/:id/guest-purchase', asyncHandler(guestPurchase));

export default router;
