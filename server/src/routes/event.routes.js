import { Router } from 'express';
import {
  listEvents,
  listCities,
  getEvent,
  myEvents,
  createEvent,
  updateEvent,
  cancelEvent,
  deleteEvent,
  restoreEvent,
  purchaseTicket,
  guestPurchase,
  eventBuyers,
  listDeletedEvents,
  purgeEvent,
} from '../controllers/event.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/', asyncHandler(listEvents));
router.get('/cities', asyncHandler(listCities));
router.get('/mine', requireAuth, requireRole('organizer'), asyncHandler(myEvents));
router.get('/deleted', requireAuth, requireRole('organizer'), asyncHandler(listDeletedEvents));
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
router.delete('/:id', requireAuth, requireRole('organizer'), asyncHandler(deleteEvent));
router.patch('/:id/restore', requireAuth, requireRole('organizer'), asyncHandler(restoreEvent));
router.delete('/:id/purge', requireAuth, requireRole('organizer'), asyncHandler(purgeEvent));

router.post(
  '/:id/purchase',
  requireAuth,
  requireRole('buyer'),
  asyncHandler(purchaseTicket)
);
router.post('/:id/guest-purchase', asyncHandler(guestPurchase));

export default router;
