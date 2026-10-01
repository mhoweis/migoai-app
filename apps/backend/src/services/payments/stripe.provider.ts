import Stripe from 'stripe';
import config from '../../config/env';
import {
  CheckoutRequest,
  CheckoutSession,
  PaymentProvider,
  PaymentState,
} from './types';

export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  private readonly stripe: Stripe;

  constructor() {
    if (!config.STRIPE_SECRET_KEY) {
      throw new Error('Stripe is not configured');
    }
    this.stripe = new Stripe(config.STRIPE_SECRET_KEY);
  }

  isConfigured(): boolean {
    return Boolean(config.STRIPE_SECRET_KEY);
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: req.currency.toLowerCase(),
          unit_amount: Math.round(req.amountMinor / req.quantity),
          product_data: { name: req.title },
        },
        quantity: req.quantity,
      }],
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      customer_email: req.customerEmail,
      client_reference_id: req.kind === 'subscription' ? req.subscriptionId : req.bookingId,
      metadata: req.kind === 'subscription'
        ? { kind: 'subscription', subscriptionId: req.subscriptionId }
        : { kind: 'booking', bookingId: req.bookingId },
    });

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL');
    }
    return { provider: this.name, reference: session.id, url: session.url };
  }

  async getState(reference: string): Promise<PaymentState> {
    const session = await this.stripe.checkout.sessions.retrieve(reference);
    if (session.payment_status === 'paid') return 'paid';
    if (session.status === 'expired') return 'failed';
    return 'pending';
  }

  async handleWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<{ reference: string; state: PaymentState }[]> {
    if (!config.STRIPE_WEBHOOK_SECRET || !signature) {
      throw new Error('Stripe webhook signature is not configured');
    }
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      config.STRIPE_WEBHOOK_SECRET,
    );
    const session = event.data.object as Stripe.Checkout.Session;
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        return [{ reference: session.id, state: 'paid' }];
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed':
        return [{ reference: session.id, state: 'failed' }];
      default:
        return [];
    }
  }
}
