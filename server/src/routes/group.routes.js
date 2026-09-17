import { Router } from 'express';
import { createGroup, listGroups, checkInGroup } from '../controllers/group.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/event/:id', asyncHandler(listGroups));
router.post('/event/:id', requireAuth, requireRole('organizer'), asyncHandler(createGroup));
router.post('/:code/checkin', requireAuth, requireRole('organizer'), asyncHandler(checkInGroup));

export default router;
