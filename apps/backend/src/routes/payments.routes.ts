import express, { Request, Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import config from '../config/env';
import ticketsService from '../services/tickets.service';
import { getPaymentProvider } from '../services/payments';
import { verifyMockPaymentToken } from '../services/payments/mock.provider';

const router = Router();
const publicRouter = Router();

const getQueryToken = (req: Request): string | undefined => (
  typeof req.query.token === 'string' ? req.query.token : undefined
);

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const mockBooking = async (reference: string, token: string | undefined) => {
  if (getPaymentProvider().name !== 'mock' || !verifyMockPaymentToken(reference, token)) {
    const error = new Error('Invalid mock checkout') as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }
  const booking = await ticketsService.getBookingByTransaction(reference);
  if (!booking) {
    const error = new Error('Checkout not found') as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }
  return booking;
};

publicRouter.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    if (getPaymentProvider().name === 'mock') {
      res.status(400).json({ success: false, error: 'Invalid payment webhook' });
      return;
    }
    const signatureHeader = req.headers['stripe-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const updates = await getPaymentProvider().handleWebhook(req.body as Buffer, signature);
    for (const update of updates) {
      const booking = await ticketsService.getBookingByTransaction(update.reference);
      if (!booking) continue;
      if (update.state === 'paid') {
        await ticketsService.confirmPaidBooking(booking.id);
      } else if (update.state === 'failed') {
        await ticketsService.markPaymentFailed(update.reference);
      }
    }
    res.json({ received: true });
  } catch (error) {
    res.status(400).json({ success: false, error: 'Invalid payment webhook' });
  }
});

publicRouter.get('/mock/:reference', asyncHandler(async (req: Request, res: Response) => {
  const booking = await mockBooking(req.params.reference, getQueryToken(req));
  res.type('html').send(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test checkout</title></head><body>
<h1>Test checkout — ${escapeHtml(booking.event.title)} — ${escapeHtml(booking.currency)} ${Number(booking.totalAmount || 0).toFixed(2)}</h1>
<form method="post" action="/api/payments/mock/${encodeURIComponent(req.params.reference)}/pay?token=${encodeURIComponent(getQueryToken(req) || '')}">
<button type="submit">Pay (test)</button></form>
<form method="get" action="/api/payments/mock/${encodeURIComponent(req.params.reference)}/cancel?token=${encodeURIComponent(getQueryToken(req) || '')}">
<button type="submit">Cancel</button></form>
</body></html>`);
}));

publicRouter.post('/mock/:reference/pay', asyncHandler(async (req: Request, res: Response) => {
  const booking = await mockBooking(req.params.reference, getQueryToken(req));
  const confirmed = await ticketsService.confirmPaidBooking(booking.id);
  const notes = typeof confirmed.notes === 'string' ? JSON.parse(confirmed.notes) : {};
  res.redirect(notes.successUrl || '/');
}));

publicRouter.get('/mock/:reference/cancel', asyncHandler(async (req: Request, res: Response) => {
  const booking = await mockBooking(req.params.reference, getQueryToken(req));
  const notes = typeof booking.notes === 'string' ? JSON.parse(booking.notes) : {};
  res.redirect(notes.cancelUrl || '/');
}));

router.get('/config', (_req: Request, res: Response) => {
  const provider = getPaymentProvider();
  res.json({
    success: true,
    data: {
      provider: provider.name,
      publishableKey: provider.name === 'stripe' ? config.STRIPE_PUBLISHABLE_KEY : '',
    },
  });
});

export { publicRouter as publicPaymentsRouter, router as paymentsRouter };