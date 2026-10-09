import prisma from '../../database/prisma';
import config from '../../config/env';
import { PassTicket } from './types';
import { buildApplePass } from './apple.pass';
import { buildGoogleSaveUrl } from './google.pass';

export { buildApplePass, buildGoogleSaveUrl };
export type { PassTicket };

export function getPassCapabilities(): { apple: boolean; google: boolean } {
  return {
    apple: Boolean(
      config.APPLE_PASS_TYPE_ID
      && config.APPLE_TEAM_ID
      && config.APPLE_PASS_CERT_PEM
      && config.APPLE_PASS_KEY_PEM
      && config.APPLE_WWDR_PEM,
    ),
    google: Boolean(
      config.GOOGLE_WALLET_ISSUER_ID
      && config.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL
      && config.GOOGLE_WALLET_PRIVATE_KEY,
    ),
  };
}

export async function getPassTicket(bookingId: string): Promise<PassTicket | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          startDate: true,
          venueName: true,
          city: true,
          coverImage: true,
        },
      },
      user: { select: { name: true } },
    },
  });
  if (!booking || !booking.qrCode) return null;
  return {
    bookingId: booking.id,
    eventId: booking.event.id,
    qrCode: booking.qrCode,
    eventTitle: booking.event.title,
    startDate: booking.event.startDate,
    venue: booking.event.venueName || booking.event.city || 'Migo event',
    city: booking.event.city || undefined,
    attendeeName: booking.attendeeName || booking.user.name || undefined,
    ticketCount: booking.ticketCount,
    coverImage: booking.event.coverImage || undefined,
  };
}
