import config from '../../config/env';
import { MockPaymentProvider } from './mock.provider';
import { StripePaymentProvider } from './stripe.provider';
import { PaymentProvider } from './types';

let provider: PaymentProvider | undefined;

export const getPaymentProvider = (): PaymentProvider => {
  if (!provider) {
    provider = config.STRIPE_SECRET_KEY
      ? new StripePaymentProvider()
      : new MockPaymentProvider();
  }
  return provider;
};

export type { PaymentProvider };
