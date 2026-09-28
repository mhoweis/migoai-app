import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/auth.middleware';
import { asyncHandler } from '../middlewares/error.middleware';
import ticketsService from '../services/tickets.service';

const router = Router();

const rsvpSchema = z.object({
  eventId: z.string().min(1),
  ticketCount: z.coerce.number().int().min(1).max(4).default(1),
  attendeeName: z.string().trim().min(1).optional(),
  attendeeEmail: z.string().email().optional(),
});

router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = rsvpSchema.parse(req.body);
  const booking = await ticketsService.createRsvp(req.userId!, input.eventId, input);
  res.status(201).json({ success: true, data: booking });
}));

router.get('/me', asyncHandler(async (req: AuthRequest, res: Response) => {
  const tickets = await ticketsService.listMyTickets(req.userId!);
  res.json({ success: true, data: tickets });
}));

router.post('/check-in', asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = z.object({ code: z.string().min(1) }).parse(req.body);
  const result = await ticketsService.checkIn(input.code, req.userId!);
  res.json({ success: true, data: result });
}));

router.get('/events/:eventId/attendance', asyncHandler(async (
  req: AuthRequest,
  res: Response,
) => {
  const result = await ticketsService.eventAttendance(req.params.eventId, req.userId!);
  res.json({ success: true, data: result });
}));

router.post('/:id/cancel', asyncHandler(async (req: AuthRequest, res: Response) => {
  const booking = await ticketsService.cancelRsvp(req.userId!, req.params.id);
  res.json({ success: true, data: booking });
}));

router.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const booking = await ticketsService.getBooking(req.params.id, req.userId!, req.user?.role || 'USER');
  res.json({ success: true, data: booking });
}));

export default router;