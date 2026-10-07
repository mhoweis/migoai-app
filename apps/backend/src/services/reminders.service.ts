import { Prisma } from '@prisma/client';
import config from '../config/env';
import prisma from '../config/database';
import logger from '../utils/logger';
import { formatShareDate } from './social.service';
import { emailService } from './messaging/email.service';
import { whatsappService } from './messaging/whatsapp.service';

export type ReminderKind = 'booked_2h' | 'booked_24h' | 'saved_48h';
type ReminderSource = 'booked' | 'saved';
type DeliveryStatus = 'sent' | 'skipped' | 'failed';
type ChannelResult = { status: DeliveryStatus; error?: string };
type ChannelSummary = { sent: number; skipped: number; failed: number };

type ReminderUser = {
  id: string;
  email: string | null;
  phone: string | null;
  preferences: Prisma.JsonValue | null;
};

type ReminderEvent = {
  id: string;
  title: string;
  startDate: Date;
  venueName: string | null;
  city: string | null;
  coverImage: string | null;
};

type ReminderCandidate = {
  user: ReminderUser;
  event: ReminderEvent;
  bookingId?: string;
  attendeeEmail?: string | null;
  attendeePhone?: string | null;
};

type ReminderMessage = {
  language: 'en' | 'ar';
  subject: string;
  body: string;
  title: string;
  date: string;
  time: string;
  venue: string;
  link: string;
  walletLink: string;
  footer: string;
};

const HOUR = 60 * 60 * 1000;
const phonePattern = /^\+[1-9]\d{7,14}$/;

export const reminderKindFor = (
  source: ReminderSource,
  startDate: Date,
  now: Date,
): ReminderKind | null => {
  const timeUntilStart = startDate.getTime() - now.getTime();
  if (timeUntilStart <= 0) return null;

  if (source === 'booked') {
    if (timeUntilStart <= 2 * HOUR) return 'booked_2h';
    if (timeUntilStart <= 24 * HOUR) return 'booked_24h';
    return null;
  }

  return timeUntilStart <= 48 * HOUR ? 'saved_48h' : null;
};

const asJsonObject = (value: Prisma.JsonValue | null | undefined): Prisma.JsonObject => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {}
);

const webBase = (): string => (config.APP_PUBLIC_URL || config.APP_URL).replace(/\/+$/, '');

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatDubaiTime = (date: Date, language: 'en' | 'ar'): string => (
  new Intl.DateTimeFormat(language === 'ar' ? 'ar-AE' : 'en-AE', {
    timeZone: 'Asia/Dubai',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
);

const buildMessage = (
  candidate: ReminderCandidate,
  kind: ReminderKind,
  preferences: Prisma.JsonObject,
): ReminderMessage => {
  const language = preferences.language === 'ar' || preferences.locale === 'ar' ? 'ar' : 'en';
  const event = candidate.event;
  const venue = event.venueName || event.city || (language === 'ar' ? 'سيُحدد لاحقاً' : 'TBA');
  const date = formatShareDate(event.startDate);
  const time = formatDubaiTime(event.startDate, language);
  const walletLink = `${webBase()}/?tab=wallet`;
  const link = kind === 'saved_48h'
    ? `${webBase()}/e/${encodeURIComponent(event.id)}`
    : walletLink;
  const footer = language === 'ar'
    ? 'إدارة التذكيرات في Migo ← الملف الشخصي ← التذكيرات'
    : 'Manage reminders in Migo → Profile → Reminders';

  if (kind === 'booked_24h') {
    return {
      language,
      subject: language === 'ar' ? `غداً: ${event.title}` : `Tomorrow: ${event.title}`,
      body: language === 'ar'
        ? `${event.title} غداً في ${date} في ${venue}. تذكرتك في محفظة Migo: ${walletLink}`
        : `${event.title} is on ${date} at ${venue}. Your ticket is in your Migo Wallet: ${walletLink}`,
      title: event.title,
      date,
      time,
      venue,
      link,
      walletLink,
      footer,
    };
  }

  if (kind === 'booked_2h') {
    return {
      language,
      subject: language === 'ar' ? `يبدأ قريباً: ${event.title}` : `Starting soon: ${event.title}`,
      body: language === 'ar'
        ? `يبدأ ${event.title} الساعة ${time} في ${venue}. جهّز رمز QR الخاص بك: ${walletLink}`
        : `${event.title} starts at ${time} at ${venue}. Have your QR ready: ${walletLink}`,
      title: event.title,
      date,
      time,
      venue,
      link,
      walletLink,
      footer,
    };
  }

  return {
    language,
    subject: language === 'ar' ? `لا تفوّت ${event.title}` : `Don't miss ${event.title}`,
    body: language === 'ar'
      ? `لقد حفظت ${event.title} — سيقام في ${date} في ${venue}. احجز تذكرتك: ${link}`
      : `You saved ${event.title} — it's on ${date} at ${venue}. Get your ticket: ${link}`,
    title: event.title,
    date,
    time,
    venue,
    link,
    walletLink,
    footer,
  };
};

const buildEmailHtml = (candidate: ReminderCandidate, message: ReminderMessage): string => {
  const cover = candidate.event.coverImage
    ? `<img src="${escapeHtml(candidate.event.coverImage)}" alt="" style="display:block;width:100%;max-height:260px;object-fit:cover;border-radius:16px 16px 0 0" />`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f7f5fb;padding:32px 16px;font-family:Arial,sans-serif;color:#140F2E"><table role="presentation" style="max-width:600px;width:100%;margin:0 auto;background:#ffffff;border-radius:16px;border-collapse:separate;border-spacing:0;overflow:hidden"><tr><td>${cover}<div style="padding:32px"><h1 style="margin:0 0 16px;color:#140F2E;font-size:24px">${escapeHtml(message.title)}</h1><p style="margin:0 0 24px;color:#140F2E;font-size:16px;line-height:1.6">${escapeHtml(message.body)}</p><a href="${escapeHtml(message.link)}" style="display:inline-block;padding:13px 22px;background:#D61F63;border-radius:10px;color:#ffffff;text-decoration:none;font-weight:700">${message.language === 'ar' ? 'افتح Migo' : 'Open Migo'}</a><p style="margin:28px 0 0;color:#6E6A86;font-size:13px">${escapeHtml(message.footer)}</p></div></td></tr></table></body></html>`;
};

const existingReminder = async (
  userId: string,
  kind: ReminderKind,
  eventId: string,
): Promise<boolean> => Boolean(await prisma.notification.findFirst({
  where: {
    userId,
    type: `reminder:${kind}`,
    data: { path: ['eventId'], equals: eventId },
  },
  select: { id: true },
}));

const recordOutcome = (summary: ChannelSummary, result: ChannelResult): void => {
  summary[result.status] += 1;
};

const errorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : String(error)
);

const sendEmail = async (
  recipient: string | null,
  enabled: boolean,
  candidate: ReminderCandidate,
  message: ReminderMessage,
): Promise<ChannelResult> => {
  if (!enabled) {
    logger.info('[email] skipped (disabled by preference)', { eventId: candidate.event.id });
    return { status: 'skipped' };
  }
  if (!recipient) {
    logger.info('[email] skipped (no recipient)', { eventId: candidate.event.id });
    return { status: 'skipped' };
  }
  try {
    const sent = await emailService.send({
      to: recipient,
      subject: message.subject,
      text: `${message.body}\n\n${message.footer}`,
      html: buildEmailHtml(candidate, message),
    });
    return { status: sent ? 'sent' : 'skipped' };
  } catch (error) {
    const messageText = errorMessage(error);
    logger.error('[email] reminder failed', { eventId: candidate.event.id, error: messageText });
    return { status: 'failed', error: messageText };
  }
};

const sendWhatsapp = async (
  recipient: string | null,
  enabled: boolean,
  candidate: ReminderCandidate,
  message: ReminderMessage,
): Promise<ChannelResult> => {
  if (!enabled) {
    logger.info('[whatsapp] skipped (disabled by preference)', { eventId: candidate.event.id });
    return { status: 'skipped' };
  }
  if (!recipient || !phonePattern.test(recipient)) {
    logger.info('[whatsapp] skipped (invalid or missing E.164 recipient)', { eventId: candidate.event.id });
    return { status: 'skipped' };
  }
  try {
    const sent = config.WHATSAPP_REMINDER_TEMPLATE
      ? await whatsappService.sendTemplate(
        recipient,
        config.WHATSAPP_REMINDER_TEMPLATE,
        message.language,
        [message.title, message.date, message.venue, message.link],
      )
      : await whatsappService.sendText(recipient, `${message.body}\n\n${message.footer}`);
    return { status: sent ? 'sent' : 'skipped' };
  } catch (error) {
    const messageText = errorMessage(error);
    logger.error('[whatsapp] reminder failed', { eventId: candidate.event.id, error: messageText });
    return { status: 'failed', error: messageText };
  }
};

const processCandidate = async (
  candidate: ReminderCandidate,
  kind: ReminderKind,
  summary: { created: number; email: ChannelSummary; whatsapp: ChannelSummary },
): Promise<void> => {
  if (await existingReminder(candidate.user.id, kind, candidate.event.id)) return;
  if (kind === 'booked_24h' && await existingReminder(candidate.user.id, 'booked_2h', candidate.event.id)) {
    return;
  }

  const preferences = asJsonObject(candidate.user.preferences);
  const reminderPreferences = asJsonObject(preferences.reminders);
  const message = buildMessage(candidate, kind, preferences);
  const emailResult = await sendEmail(
    candidate.attendeeEmail || candidate.user.email,
    reminderPreferences.email !== false,
    candidate,
    message,
  );
  const whatsappRecipient = candidate.attendeePhone || candidate.user.phone;
  const whatsappResult = await sendWhatsapp(
    whatsappRecipient,
    reminderPreferences.whatsapp !== false,
    candidate,
    message,
  );
  recordOutcome(summary.email, emailResult);
  recordOutcome(summary.whatsapp, whatsappResult);

  const sent = emailResult.status === 'sent' || whatsappResult.status === 'sent';
  const channels: { email: ChannelResult; whatsapp: ChannelResult } = {
    email: emailResult,
    whatsapp: whatsappResult,
  };
  await prisma.notification.create({
    data: {
      userId: candidate.user.id,
      type: `reminder:${kind}`,
      title: message.subject,
      message: `${message.body}\n\n${message.footer}`,
      data: {
        eventId: candidate.event.id,
        ...(candidate.bookingId ? { bookingId: candidate.bookingId } : {}),
        channels,
      },
      isSent: sent,
      sentAt: sent ? new Date() : null,
    },
  });
  summary.created += 1;
};

export const runReminders = async (now = new Date()): Promise<{
  considered: number;
  created: number;
  email: ChannelSummary;
  whatsapp: ChannelSummary;
}> => {
  const bookedUntil = new Date(now.getTime() + 24 * HOUR);
  const savedUntil = new Date(now.getTime() + 48 * HOUR);
  const selectEvent = {
    id: true,
    title: true,
    startDate: true,
    venueName: true,
    city: true,
    coverImage: true,
  } as const;
  const selectUser = {
    id: true,
    email: true,
    phone: true,
    preferences: true,
  } as const;
  const bookings = await prisma.booking.findMany({
    where: {
      status: 'CONFIRMED',
      checkedInAt: null,
      event: { startDate: { gt: now, lte: bookedUntil } },
    },
    include: {
      event: { select: selectEvent },
      user: { select: selectUser },
    },
  });
  const wishlists = await prisma.wishlist.findMany({
    where: { event: { startDate: { gt: now, lte: savedUntil } } },
    include: {
      event: { select: selectEvent },
      user: { select: selectUser },
    },
  });
  const confirmed = wishlists.length
    ? await prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        userId: { in: [...new Set(wishlists.map(row => row.userId))] },
        eventId: { in: [...new Set(wishlists.map(row => row.eventId))] },
      },
      select: { userId: true, eventId: true },
    })
    : [];
  const confirmedPairs = new Set(confirmed.map(row => `${row.userId}:${row.eventId}`));
  const savedCandidates: ReminderCandidate[] = wishlists
    .filter(row => !confirmedPairs.has(`${row.userId}:${row.eventId}`))
    .filter(row => asJsonObject(asJsonObject(row.user.preferences).reminders).saved !== false)
    .map(row => ({ user: row.user, event: row.event }));
  const bookedCandidates: ReminderCandidate[] = bookings.map(booking => ({
    user: booking.user,
    event: booking.event,
    bookingId: booking.id,
    attendeeEmail: booking.attendeeEmail,
    attendeePhone: booking.attendeePhone,
  }));
  const candidates = [...bookedCandidates, ...savedCandidates];
  const summary = {
    considered: candidates.length,
    created: 0,
    email: { sent: 0, skipped: 0, failed: 0 },
    whatsapp: { sent: 0, skipped: 0, failed: 0 },
  };

  for (const candidate of candidates) {
    const source: ReminderSource = candidate.bookingId ? 'booked' : 'saved';
    const kind = reminderKindFor(source, candidate.event.startDate, now);
    if (!kind) continue;
    await processCandidate(candidate, kind, summary);
  }

  return summary;
};
