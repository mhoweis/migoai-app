import { PKPass } from 'passkit-generator';
import config from '../../config/env';
import { PassTicket } from './types';

const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const configuredValue = (value: string, base64Name?: string): string | undefined => {
  if (value) return value;
  if (!base64Name) return undefined;
  const encoded = process.env[base64Name];
  return encoded ? Buffer.from(encoded, 'base64').toString('utf8') : undefined;
};

const certificates = () => {
  const wwdr = configuredValue(config.APPLE_WWDR_PEM, 'APPLE_WWDR_PEM_B64');
  const signerCert = configuredValue(config.APPLE_PASS_CERT_PEM, 'APPLE_PASS_CERT_PEM_B64');
  const signerKey = configuredValue(config.APPLE_PASS_KEY_PEM, 'APPLE_PASS_KEY_PEM_B64');
  if (!wwdr || !signerCert || !signerKey) return null;
  return { wwdr, signerCert, signerKey };
};

export async function buildApplePass(ticket: PassTicket): Promise<Buffer> {
  const passTypeIdentifier = config.APPLE_PASS_TYPE_ID;
  const teamIdentifier = config.APPLE_TEAM_ID;
  const certs = certificates();
  if (!passTypeIdentifier || !teamIdentifier || !certs) {
    throw new Error('Apple Wallet is not configured');
  }
  const pass = new PKPass(
    { 'icon.png': PLACEHOLDER_PNG, 'logo.png': PLACEHOLDER_PNG },
    certs,
    {
      passTypeIdentifier,
      teamIdentifier,
      serialNumber: ticket.bookingId,
      description: 'Migo event ticket',
      organizationName: 'Migo',
      logoText: 'Migo',
      backgroundColor: '#0F172A',
      foregroundColor: '#FFFFFF',
    },
  );
  pass.type = 'eventTicket';
  pass.setBarcodes({
    message: ticket.qrCode,
    format: 'PKBarcodeFormatQR',
  });
  pass.primaryFields.push({ key: 'event', label: 'EVENT', value: ticket.eventTitle });
  pass.secondaryFields.push({
    key: 'date',
    label: 'DATE',
    value: new Intl.DateTimeFormat('en-AE', {
      timeZone: 'Asia/Dubai',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(ticket.startDate),
  });
  pass.secondaryFields.push({ key: 'venue', label: 'VENUE', value: ticket.venue });
  pass.auxiliaryFields.push({
    key: 'attendee',
    label: 'ATTENDEE',
    value: ticket.attendeeName || 'Guest',
  });
  pass.auxiliaryFields.push({
    key: 'tickets',
    label: 'TICKETS',
    value: String(ticket.ticketCount),
  });
  pass.setRelevantDate(ticket.startDate);
  return pass.getAsBuffer();
}
