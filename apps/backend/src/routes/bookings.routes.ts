import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/auth.middleware';
import { asyncHandler } from '../middlewares/error.middleware';
import ticketsService from '../services/tickets.service';
import transfersService from '../services/transfers.service';
import { buildApplePass, buildGoogleSaveUrl, getPassCapabilities, getPassTicket } from '../services/wallet-passes';
import { BookingStatus } from '@prisma/client';

const router = Router();

const rsvpSchema = z.object({
  eventId: z.string().min(1),
  ticketCount: z.coerce.number().int().min(1).max(4).default(1),
  attendeeName: z.string().trim().min(1).optional(),
  attendeeEmail: z.string().email().optional(),
  inviteCode: z.string().trim().max(16).optional(),
});

const returnUrlSchema = z.string().url().refine(value => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:' || protocol === 'migo:';
}, 'Return URL must use http, https, or migo');

const checkoutSchema = z.object({
  eventId: z.string().min(1),
  ticketCount: z.coerce.number().int().min(1).max(4).default(1),
  returnUrl: returnUrlSchema,
  inviteCode: z.string().trim().max(16).optional(),
});

const routeError = (message: string, statusCode: number, code: string) => {
  const error = new Error(message) as any;
  error.statusCode = statusCode;
  error.status = 'fail';
  error.code = code;
  error.isOperational = true;
  return error;
};

router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = rsvpSchema.parse(req.body);
  const booking = await ticketsService.createRsvp(req.userId!, input.eventId, input);
  res.status(201).json({ success: true, data: booking });
}));

router.post('/checkout', asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = checkoutSchema.parse(req.body);
  const result = await ticketsService.createCheckout(req.userId!, input.eventId, input);
  res.status(201).json({ success: true, data: result });
}));

router.get('/passes/config', asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({ success: true, data: getPassCapabilities() });
}));

router.get('/me', asyncHandler(async (req: AuthRequest, res: Response) => {
  const tickets = await ticketsService.listMyTickets(req.userId!);
  res.json({ success: true, data: tickets });
}));

router.post('/:id/transfer', asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = z.object({ toEmail: z.string().email() }).parse(req.body);
  const result = await transfersService.createTransfer(req.params.id, req.userId!, input.toEmail);
  res.status(201).json({ success: true, data: result });
}));

router.delete('/transfers/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  await transfersService.cancelTransfer(req.params.id, req.userId!);
  res.json({ success: true });
}));

router.get('/transfers/:code', asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await transfersService.getTransferByCode(req.params.code, req.userId!);
  res.json({ success: true, data: result });
}));

router.post('/transfers/:code/accept', asyncHandler(async (req: AuthRequest, res: Response) => {
  const booking = await transfersService.acceptTransfer(req.params.code, req.userId!);
  res.json({ success: true, data: booking });
}));

router.get('/:id/pass/apple', asyncHandler(async (req: AuthRequest, res: Response) => {
  const booking = await ticketsService.getBooking(req.params.id, req.userId!, req.user?.role || 'USER');
  if (![BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN].includes(booking.status)) {
    throw routeError('Booking is not eligible for a wallet pass', 400, 'BOOKING_NOT_CONFIRMED');
  }
  if (!getPassCapabilities().apple) {
    res.status(501).json({ success: false, error: 'Apple Wallet is not configured', code: 'NOT_CONFIGURED' });
    return;
  }
  const ticket = await getPassTicket(req.params.id);
  if (!ticket) throw routeError('Booking has no ticket code', 400, 'NO_TICKET_CODE');
  const buffer = await buildApplePass(ticket);
  res.type('application/vnd.apple.pkpass');
  res.setHeader('Content-Disposition', `attachment; filename="migo-${ticket.bookingId}.pkpass"`);
  res.send(buffer);
}));

router.get('/:id/pass/google', asyncHandler(async (req: AuthRequest, res: Response) => {
  const booking = await ticketsService.getBooking(req.params.id, req.userId!, req.user?.role || 'USER');
  if (![BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN].includes(booking.status)) {
    throw routeError('Booking is not eligible for a wallet pass', 400, 'BOOKING_NOT_CONFIRMED');
  }
  if (!getPassCapabilities().google) {
    res.status(501).json({ success: false, error: 'Google Wallet is not configured', code: 'NOT_CONFIGURED' });
    return;
  }
  const ticket = await getPassTicket(req.params.id);
  if (!ticket) throw routeError('Booking has no ticket code', 400, 'NO_TICKET_CODE');
  res.json({ success: true, data: { saveUrl: buildGoogleSaveUrl(ticket) } });
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

router.post('/:id/confirm', asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await ticketsService.confirmBooking(req.params.id, req.userId!);
  if (result.state === 'pending') {
    res.status(202).json({ success: true, data: { status: 'PENDING' } });
    return;
  }
  res.json({ success: true, data: result.booking });
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