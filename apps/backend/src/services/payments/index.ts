import config from '../../config/env';
import { MockPaymentProvider } from './mock.provider';
import { StripePaymentProvider } from './stripe.provider';
import { PaymentProvider, PaymentState } from './types';

const paymentsUnavailable = (): Error => {
  const error = new Error('Payments are not available yet') as Error & { statusCode?: number; code?: string };
  error.statusCode = 503;
  error.code = 'PAYMENTS_UNAVAILABLE';
  return error;
};

// Used in production when Stripe isn't configured: the mock checkout page is
// disabled there, so paid checkouts are refused instead of dead-ending.
class UnavailablePaymentProvider implements PaymentProvider {
  readonly name = 'unavailable';

  isConfigured(): boolean {
    return false;
  }

  async createCheckout(): Promise<never> {
    throw paymentsUnavailable();
  }

  async getState(): Promise<PaymentState> {
    return 'pending';
  }

  async handleWebhook(): Promise<never> {
    throw paymentsUnavailable();
  }
}

let provider: PaymentProvider | undefined;

export const getPaymentProvider = (): PaymentProvider => {
  if (!provider) {
    if (config.STRIPE_SECRET_KEY) {
      provider = new StripePaymentProvider();
    } else if (config.NODE_ENV === 'production') {
      provider = new UnavailablePaymentProvider();
    } else {
      provider = new MockPaymentProvider();
    }
  }
  return provider;
};

export type { PaymentProvider };
