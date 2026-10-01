import crypto from 'crypto';
import config from '../../config/env';
import prisma from '../../database/prisma';
import {
  CheckoutRequest,
  CheckoutSession,
  PaymentProvider,
  PaymentState,
} from './types';

const tokenSecret = () => config.TICKET_SIGNING_SECRET || config.JWT_SECRET;

export const createMockPaymentToken = (reference: string): string => (
  crypto.createHmac('sha256', tokenSecret()).update(reference).digest('hex')
);

export const verifyMockPaymentToken = (reference: string, token: string | undefined): boolean => {
  if (!token) return false;
  const expected = createMockPaymentToken(reference);
  const suppliedBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
};

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  isConfigured(): boolean {
    return true;
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const reference = req.kind === 'subscription'
      ? `mock_sub_${req.subscriptionId}`
      : `mock_${req.bookingId}`;
    const token = createMockPaymentToken(reference);
    const returnOrigin = /^https?:/.test(req.successUrl) ? new URL(req.successUrl).origin : '';
    const baseUrl = config.APP_PUBLIC_URL || returnOrigin || config.APP_URL;
    return {
      provider: this.name,
      reference,
      url: `${baseUrl}/api/payments/mock/${reference}?token=${encodeURIComponent(token)}`,
    };
  }

  async getState(reference: string): Promise<PaymentState> {
    if (reference.startsWith('mock_sub_')) {
      const subscription = await prisma.subscription.findFirst({
        where: { reference },
        select: { status: true },
      });
      if (subscription?.status === 'ACTIVE') return 'paid';
      if (subscription?.status === 'CANCELLED' || subscription?.status === 'EXPIRED') return 'failed';
      return 'pending';
    }
    const booking = await prisma.booking.findFirst({
      where: { transactionId: reference },
      select: { status: true },
    });
    return booking?.status === 'CONFIRMED' || booking?.status === 'CHECKED_IN'
      ? 'paid'
      : 'pending';
  }

  async handleWebhook(): Promise<{ reference: string; state: PaymentState }[]> {
    return [];
  }
}
