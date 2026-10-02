import jwt from 'jsonwebtoken';
import config from '../../config/env';
import { PassTicket } from './types';

export function buildGoogleSaveUrl(ticket: PassTicket): string {
  const issuerId = config.GOOGLE_WALLET_ISSUER_ID;
  const serviceAccountEmail = config.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
  const privateKey = config.GOOGLE_WALLET_PRIVATE_KEY;
  if (!issuerId || !serviceAccountEmail || !privateKey) {
    throw new Error('Google Wallet is not configured');
  }
  const classId = `${issuerId}.migo_event_${ticket.eventId || ticket.bookingId}`;
  const objectId = `${issuerId}.booking_${ticket.bookingId}`;
  const token = jwt.sign({
    iss: serviceAccountEmail,
    aud: 'google',
    origins: [],
    typ: 'savetowallet',
    eventTicketClasses: [{
      id: classId,
      eventName: { defaultValue: { language: 'en-US', value: ticket.eventTitle } },
      venue: { name: { defaultValue: { language: 'en-US', value: ticket.venue } } },
      dateTime: { start: ticket.startDate.toISOString() },
      reviewStatus: 'UNDER_REVIEW',
      issuerName: 'Migo',
    }],
    eventTicketObjects: [{
      id: objectId,
      classId,
      state: 'ACTIVE',
      barcode: { type: 'QR_CODE', value: ticket.qrCode },
      ticketHolderName: ticket.attendeeName || 'Guest',
    }],
  } as Record<string, unknown>, privateKey as jwt.Secret, {
    algorithm: 'RS256',
    header: { typ: 'savetowallet', alg: 'RS256' },
  });
  return `https://pay.google.com/gp/v/save/${token}`;
}
