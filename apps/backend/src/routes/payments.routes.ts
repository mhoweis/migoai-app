import express, { Request, Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import config from '../config/env';
import prisma from '../config/database';
import ticketsService from '../services/tickets.service';
import { getPaymentProvider } from '../services/payments';
import { verifyMockPaymentToken } from '../services/payments/mock.provider';
import { activateSubscription, withCheckoutResult } from '../services/plans.service';

const router = Router();
const publicRouter = Router();

publicRouter.use('/mock', (req, res, next) => {
  if (config.NODE_ENV === 'production') return res.sendStatus(404);
  next();
});

const getQueryToken = (req: Request): string | undefined => (
  typeof req.query.token === 'string' ? req.query.token : undefined
);

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const mockCheckout = async (reference: string, token: string | undefined) => {
  if (getPaymentProvider().name !== 'mock' || !verifyMockPaymentToken(reference, token)) {
    const error = new Error('Invalid mock checkout') as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }
  const subscription = await prisma.subscription.findUnique({ where: { reference } });
  if (subscription) return { kind: 'subscription' as const, subscription };
  const booking = await ticketsService.getBookingByTransaction(reference);
  if (!booking) {
    const error = new Error('Checkout not found') as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }
  return { kind: 'booking' as const, booking };
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
      const subscription = await prisma.subscription.findUnique({
        where: { reference: update.reference },
      });
      if (subscription) {
        if (update.state === 'paid') {
          await activateSubscription(subscription.id);
        } else if (update.state === 'failed' && subscription.status === 'PENDING') {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'CANCELLED', cancelledAt: new Date() },
          });
        }
        continue;
      }
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
  const checkout = await mockCheckout(req.params.reference, getQueryToken(req));
  const title = checkout.kind === 'subscription'
    ? `Migo ${checkout.subscription.plan === 'HOST' ? 'Host' : 'Supplier'} plan`
    : checkout.booking.event.title;
  const amount = checkout.kind === 'subscription'
    ? `AED ${Number(checkout.subscription.amountAed).toFixed(2)}`
    : `${escapeHtml(checkout.booking.currency)} ${Number(checkout.booking.totalAmount || 0).toFixed(2)}`;
  res.type('html').send(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test checkout</title></head><body>
<h1>Test checkout — ${escapeHtml(title)} — ${amount}</h1>
<form method="post" action="/api/payments/mock/${encodeURIComponent(req.params.reference)}/pay?token=${encodeURIComponent(getQueryToken(req) || '')}">
<button type="submit">Pay (test)</button></form>
<form method="get" action="/api/payments/mock/${encodeURIComponent(req.params.reference)}/cancel?token=${encodeURIComponent(getQueryToken(req) || '')}">
<button type="submit">Cancel</button></form>
</body></html>`);
}));

publicRouter.post('/mock/:reference/pay', asyncHandler(async (req: Request, res: Response) => {
  const checkout = await mockCheckout(req.params.reference, getQueryToken(req));
  if (checkout.kind === 'subscription') {
    await activateSubscription(checkout.subscription.id);
    res.redirect(withCheckoutResult(checkout.subscription.returnUrl, 'success'));
    return;
  }
  const confirmed = await ticketsService.confirmPaidBooking(checkout.booking.id);
  const notes = typeof confirmed.notes === 'string' ? JSON.parse(confirmed.notes) : {};
  res.redirect(notes.successUrl || '/');
}));

publicRouter.get('/mock/:reference/cancel', asyncHandler(async (req: Request, res: Response) => {
  const checkout = await mockCheckout(req.params.reference, getQueryToken(req));
  if (checkout.kind === 'subscription') {
    await prisma.subscription.updateMany({
      where: { id: checkout.subscription.id, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    res.redirect(withCheckoutResult(checkout.subscription.returnUrl, 'cancel'));
    return;
  }
  const notes = typeof checkout.booking.notes === 'string' ? JSON.parse(checkout.booking.notes) : {};
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