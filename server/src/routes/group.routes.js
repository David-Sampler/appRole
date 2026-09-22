import { Router } from 'express';
import {
  createGroup,
  updateGroup,
  listGroups,
  purchaseGroup,
  guestPurchaseGroup,
  checkInGroup,
} from '../controllers/group.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/event/:id', asyncHandler(listGroups));
router.post('/event/:id', requireAuth, requireRole('organizer'), asyncHandler(createGroup));
router.put('/:id', requireAuth, requireRole('organizer'), asyncHandler(updateGroup));
router.post('/:id/purchase', requireAuth, requireRole('buyer'), asyncHandler(purchaseGroup));
router.post('/:id/guest-purchase', asyncHandler(guestPurchaseGroup));
router.post('/:code/checkin', requireAuth, requireRole('organizer'), asyncHandler(checkInGroup));

export default router;
