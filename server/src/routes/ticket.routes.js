import { Router } from 'express';
import { myTickets, checkInTicket, getTicketByCode, cancelTicket, claimTicket } from '../controllers/ticket.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/mine', requireAuth, requireRole('buyer'), asyncHandler(myTickets));
router.get('/by-code/:code', asyncHandler(getTicketByCode));
router.post('/:code/claim', asyncHandler(claimTicket));
router.post('/checkin', requireAuth, requireRole('organizer'), asyncHandler(checkInTicket));
router.post('/:id/cancel', requireAuth, requireRole('buyer'), asyncHandler(cancelTicket));

export default router;
