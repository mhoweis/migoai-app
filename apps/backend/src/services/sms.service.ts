import twilio from 'twilio';
import config from '../config/env';

class SmsService {
  private client: ReturnType<typeof twilio> | null = null;

  private getClient(): ReturnType<typeof twilio> {
    if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN) {
      throw new Error('Twilio SMS sender configuration is incomplete');
    }
    this.client ??= twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
    return this.client;
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    if (!config.TWILIO_PHONE_NUMBER) {
      throw new Error('Twilio SMS sender configuration is incomplete');
    }

    try {
      await this.getClient().messages.create({
        to,
        from: config.TWILIO_PHONE_NUMBER,
        body: `Your Migo verification code is ${code}. It expires in 10 minutes.`,
      });
    } catch (error) {
      const message = (error as { message?: string })?.message;
      throw new Error(message || 'Twilio request failed');
    }
  }
}

export const smsService = new SmsService();
