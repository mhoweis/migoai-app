import axios from 'axios';
import config from '../../config/env';
import prisma from '../../config/database';
import logger from '../../utils/logger';
import { formatShareDate } from '../social.service';

const webBase = () => (config.APP_PUBLIC_URL || config.APP_URL).replace(/\/+$/, '');

const configured = (): boolean => Boolean(
  config.WHATSAPP_ACCESS_TOKEN && config.WHATSAPP_PHONE_NUMBER_ID,
);

export const whatsappService = {
  isConfigured(): boolean {
    return configured();
  },

  async sendText(toE164: string, body: string): Promise<boolean> {
    if (!configured()) {
      logger.info('[whatsapp] skipped (not configured)');
      return false;
    }
    await axios.post(
      `https://graph.facebook.com/v20.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: toE164,
        type: 'text',
        text: { body },
      },
      {
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
    );
    return true;
  },

  async sendTemplate(
    toE164: string,
    name: string,
    lang: 'en' | 'ar',
    params: string[],
  ): Promise<boolean> {
    if (!configured()) {
      logger.info('[whatsapp] skipped (not configured)');
      return false;
    }
    await axios.post(
      `https://graph.facebook.com/v20.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: toE164,
        type: 'template',
        template: {
          name,
          language: { code: lang },
          components: [{
            type: 'body',
            parameters: params.map(text => ({ type: 'text', text })),
          }],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
    );
    return true;
  },

  async sendTicketConfirmation(bookingId: string): Promise<void> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        event: { select: { title: true, startDate: true, venueName: true, city: true } },
        user: { select: { phone: true } },
      },
    });
    if (!booking?.user.phone) return;
    const venue = booking.event.venueName || booking.event.city || 'TBA';
    const body = `Your ticket for ${booking.event.title} — ${formatShareDate(booking.event.startDate)} at ${venue}. Show the QR in your Migo Wallet at the door: ${webBase()}/?tab=wallet`;
    await this.sendText(booking.user.phone, body);
  },
};
