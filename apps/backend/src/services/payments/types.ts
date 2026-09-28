export interface CheckoutRequest {
  bookingId: string;
  userId: string;
  eventId: string;
  title: string;
  amountMinor: number;
  currency: string;
  quantity: number;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  provider: string;
  reference: string;
  url: string;
}

export type PaymentState = 'paid' | 'pending' | 'failed';

export interface PaymentProvider {
  readonly name: string;
  isConfigured(): boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  getState(reference: string): Promise<PaymentState>;
  handleWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<{ reference: string; state: PaymentState }[]>;
}
