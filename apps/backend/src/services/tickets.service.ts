import crypto from 'crypto';
import { BookingStatus, Prisma } from '@prisma/client';
import config from '../config/env';
import prisma from '../database/prisma';
import { AppError } from '../middlewares/error.middleware';
import { getPaymentProvider } from './payments';
import { findInviteForEvent } from './social.service';
import { whatsappService } from './messaging/whatsapp.service';
import { recordSignal } from './recommendation.service';

const serviceError = (
  message: string,
  statusCode: number,
  code: string,
  errors?: any,
): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.status = statusCode >= 500 ? 'error' : 'fail';
  error.code = code;
  error.errors = errors;
  error.isOperational = true;
  return error;
};

const eventTicketSelect = {
  id: true,
  title: true,
  startDate: true,
  endDate: true,
  venueName: true,
  city: true,
  category: true,
  coverImage: true,
  priceFrom: true,
  currency: true,
  isFree: true,
} as const;

class TicketsService {
  signTicket(bookingId: string, eventId: string, userId: string): string {
    const signature = crypto
      .createHmac('sha256', config.TICKET_SIGNING_SECRET || config.JWT_SECRET)
      .update(`${bookingId}.${eventId}.${userId}`)
      .digest('hex');
    return `MIGO1:${bookingId}:${signature.slice(0, 32)}`;
  }

  async verifyTicketCode(code: string): Promise<string | null> {
    const parts = code.split(':');
    if (parts.length !== 3 || parts[0] !== 'MIGO1' || !parts[1] || !/^[a-f0-9]{32}$/i.test(parts[2])) {
      return null;
    }
    const booking = await prisma.booking.findUnique({
      where: { id: parts[1] },
      select: { id: true, eventId: true, userId: true },
    });
    if (!booking) {
      return null;
    }
    const expected = this.signTicket(booking.id, booking.eventId, booking.userId).split(':')[2];
    const suppliedBuffer = Buffer.from(parts[2], 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (
      suppliedBuffer.length !== expectedBuffer.length
      || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      return null;
    }
    return booking.id;
  }

  async createRsvp(
    userId: string,
    eventId: string,
    input: {
      ticketCount?: number;
      attendeeName?: string;
      attendeeEmail?: string;
      inviteCode?: string;
    } = {},
  ): Promise<any> {
    const ticketCount = input.ticketCount ?? 1;
    if (!Number.isInteger(ticketCount) || ticketCount < 1 || ticketCount > 4) {
      throw serviceError('Ticket count must be between 1 and 4', 400, 'INVALID_TICKET_COUNT');
    }

    const [event, user] = await Promise.all([
      prisma.event.findUnique({ where: { id: eventId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    ]);
    if (!event) {
      throw serviceError('Event not found', 404, 'EVENT_NOT_FOUND');
    }
    if (event.status !== 'ACTIVE' || event.startDate < new Date()) {
      throw serviceError('Event is not available for RSVP', 400, 'EVENT_NOT_AVAILABLE');
    }
    if (event.externalUrl && event.bookingType === 'PAID' && !event.isFree) {
      throw serviceError('This event requires external booking', 400, 'EXTERNAL_BOOKING', {
        externalUrl: event.externalUrl,
      });
    }
    if (!event.isFree) {
      throw serviceError('This event requires paid checkout', 400, 'NOT_PURCHASABLE');
    }
    if ((event.capacity || 0) > 0 && (event.ticketsSold || 0) + ticketCount > (event.capacity || 0)) {
      throw serviceError('Event is sold out', 409, 'SOLD_OUT');
    }
    const invite = await findInviteForEvent(eventId, input.inviteCode);

    try {
      const booking = await prisma.$transaction(async tx => {
        const booking = await tx.booking.create({
          data: {
            userId,
            eventId,
            ticketCount,
            totalAmount: 0,
            currency: event.currency,
            status: BookingStatus.CONFIRMED,
            attendeeName: input.attendeeName || user?.name || undefined,
            attendeeEmail: input.attendeeEmail || user?.email || undefined,
            inviteCode: invite?.code,
          },
        });
        const ticketsSold = (event.ticketsSold || 0) + ticketCount;
        await tx.event.update({
          where: { id: event.id },
          data: {
            ticketsSold,
            ticketsAvailable: (event.capacity || 0) > 0 ? (event.capacity || 0) - ticketsSold : null,
          },
        });
        const qrCode = this.signTicket(booking.id, event.id, userId);
        return tx.booking.update({
          where: { id: booking.id },
          data: { qrCode },
          include: { event: true },
        });
      });
      void whatsappService.sendTicketConfirmation(booking.id).catch(error => {
        console.error('[whatsapp] ticket confirmation failed', error);
      });
      return booking;
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const existing = await prisma.booking.findUnique({
          where: { userId_eventId: { userId, eventId } },
          include: { event: true },
        });
        throw serviceError('You have already booked this event', 409, 'ALREADY_BOOKED', existing);
      }
      throw error;
    }
  }

  async createCheckout(
    userId: string,
    eventId: string,
    input: { ticketCount: number; returnUrl: string; inviteCode?: string },
  ): Promise<{ bookingId: string; checkoutUrl: string; provider: string }> {
    if (!Number.isInteger(input.ticketCount) || input.ticketCount < 1 || input.ticketCount > 4) {
      throw serviceError('Ticket count must be between 1 and 4', 400, 'INVALID_TICKET_COUNT');
    }

    const [event, user] = await Promise.all([
      prisma.event.findUnique({ where: { id: eventId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    ]);
    if (!event) {
      throw serviceError('Event not found', 404, 'EVENT_NOT_FOUND');
    }
    if (
      event.status !== 'ACTIVE'
      || event.startDate <= new Date()
      || event.isFree
      || Number(event.priceFrom || 0) <= 0
      || Boolean(event.externalUrl && event.bookingType === 'PAID')
    ) {
      throw serviceError('This event is not available for payment', 400, 'NOT_PURCHASABLE');
    }

    const existing = await prisma.booking.findUnique({
      where: { userId_eventId: { userId, eventId } },
      select: { id: true, status: true },
    });
    if (existing?.status === BookingStatus.CONFIRMED || existing?.status === BookingStatus.CHECKED_IN) {
      throw serviceError('You have already booked this event', 409, 'ALREADY_BOOKED');
    }

    const provider = getPaymentProvider();
    const invite = await findInviteForEvent(eventId, input.inviteCode);
    const amount = Number(event.priceFrom) * input.ticketCount;
    const successUrl = this.appendCheckoutParams(input.returnUrl, {
      checkout: 'success',
      bookingId: existing?.id || 'BOOKING_ID',
    });
    const cancelUrl = this.appendCheckoutParams(input.returnUrl, {
      checkout: 'cancel',
      bookingId: existing?.id || 'BOOKING_ID',
    });

    const booking = await prisma.$transaction(async tx => {
      const currentEvent = await tx.event.findUnique({ where: { id: eventId } });
      if (!currentEvent) {
        throw serviceError('Event not found', 404, 'EVENT_NOT_FOUND');
      }
      const currentBooking = await tx.booking.findUnique({
        where: { userId_eventId: { userId, eventId } },
      });
      if (
        currentBooking?.status === BookingStatus.CONFIRMED
        || currentBooking?.status === BookingStatus.CHECKED_IN
      ) {
        throw serviceError('You have already booked this event', 409, 'ALREADY_BOOKED');
      }

      const bookings = await tx.booking.findMany({
        where: {
          eventId,
          status: {
            in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN],
          },
        },
        select: { id: true, ticketCount: true, status: true, bookingDate: true },
      });
      const pendingCutoff = Date.now() - 30 * 60 * 1000;
      const taken = bookings.reduce((sum, item) => {
        if (item.id === currentBooking?.id) return sum;
        if (
          item.status === BookingStatus.PENDING
          && item.bookingDate.getTime() < pendingCutoff
        ) {
          return sum;
        }
        return sum + item.ticketCount;
      }, 0);
      if ((currentEvent.capacity || 0) > 0 && taken + input.ticketCount > (currentEvent.capacity || 0)) {
        throw serviceError('Event is sold out', 409, 'SOLD_OUT');
      }

      const data = {
        ticketCount: input.ticketCount,
        totalAmount: amount,
        currency: currentEvent.currency,
        status: BookingStatus.PENDING,
        paymentMethod: provider.name,
        qrCode: null,
        transactionId: null,
        notes: JSON.stringify({ successUrl, cancelUrl }),
        inviteCode: invite?.code,
        attendeeName: user?.name || undefined,
        attendeeEmail: user?.email || undefined,
      };
      if (currentBooking) {
        return tx.booking.update({ where: { id: currentBooking.id }, data });
      }
      return tx.booking.create({ data: { ...data, userId, eventId } });
    });

    const session = await provider.createCheckout({
      bookingId: booking.id,
      userId,
      eventId,
      title: event.title,
      amountMinor: Math.round(amount * 100),
      currency: event.currency,
      quantity: input.ticketCount,
      customerEmail: user?.email || undefined,
      successUrl: this.appendCheckoutParams(input.returnUrl, {
        checkout: 'success',
        bookingId: booking.id,
      }),
      cancelUrl: this.appendCheckoutParams(input.returnUrl, {
        checkout: 'cancel',
        bookingId: booking.id,
      }),
    });
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        transactionId: session.reference,
        paymentMethod: session.provider,
        notes: JSON.stringify({
          successUrl: this.appendCheckoutParams(input.returnUrl, {
            checkout: 'success',
            bookingId: booking.id,
          }),
          cancelUrl: this.appendCheckoutParams(input.returnUrl, {
            checkout: 'cancel',
            bookingId: booking.id,
          }),
        }),
      },
    });
    return {
      bookingId: booking.id,
      checkoutUrl: session.url,
      provider: session.provider,
    };
  }

  private appendCheckoutParams(
    returnUrl: string,
    params: Record<string, string>,
  ): string {
    const parsed = new URL(returnUrl);
    Object.entries(params).forEach(([key, value]) => parsed.searchParams.set(key, value));
    return parsed.toString();
  }

  async confirmPaidBooking(bookingId: string): Promise<any> {
    let newlyConfirmed = false;
    const confirmed = await prisma.$transaction(async tx => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { event: true },
      });
      if (!booking) {
        throw serviceError('Booking not found', 404, 'BOOKING_NOT_FOUND');
      }
      if (
        booking.status === BookingStatus.CONFIRMED
        || booking.status === BookingStatus.CHECKED_IN
      ) {
        return booking;
      }
      if (booking.status !== BookingStatus.PENDING) {
        throw serviceError('Booking is not pending payment', 400, 'BOOKING_NOT_PENDING');
      }
      const ticketsSold = (booking.event.ticketsSold || 0) + booking.ticketCount;
      await tx.event.update({
        where: { id: booking.eventId },
        data: {
          ticketsSold,
          ticketsAvailable: (booking.event.capacity || 0) > 0
            ? (booking.event.capacity || 0) - ticketsSold
            : null,
        },
      });
      const qrCode = this.signTicket(booking.id, booking.eventId, booking.userId);
      newlyConfirmed = true;
      return tx.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.CONFIRMED, qrCode },
        include: { event: true },
      });
    });
    if (confirmed.status === BookingStatus.CONFIRMED) {
      void whatsappService.sendTicketConfirmation(confirmed.id).catch(error => {
        console.error('[whatsapp] ticket confirmation failed', error);
      });
      if (newlyConfirmed) {
        void recordSignal(confirmed.userId, 'book', { eventId: confirmed.eventId });
      }
    }
    return confirmed;
  }

  async confirmBooking(bookingId: string, userId: string): Promise<
    { state: 'confirmed'; booking: any }
    | { state: 'pending'; booking: any }
  > {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { event: true },
    });
    if (!booking || booking.userId !== userId) {
      throw serviceError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }
    if (booking.status === BookingStatus.CONFIRMED || booking.status === BookingStatus.CHECKED_IN) {
      return { state: 'confirmed', booking };
    }
    if (booking.status !== BookingStatus.PENDING || !booking.transactionId) {
      throw serviceError('Booking is not pending payment', 400, 'BOOKING_NOT_PENDING');
    }

    const state = await getPaymentProvider().getState(booking.transactionId);
    if (state === 'paid') {
      return { state: 'confirmed', booking: await this.confirmPaidBooking(booking.id) };
    }
    if (state === 'failed') {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.CANCELLED },
      });
      throw serviceError('Payment failed', 402, 'PAYMENT_FAILED');
    }
    return { state: 'pending', booking };
  }

  async getBookingByTransaction(reference: string): Promise<any | null> {
    return prisma.booking.findFirst({
      where: { transactionId: reference },
      include: { event: true },
    });
  }

  async markPaymentFailed(reference: string): Promise<void> {
    await prisma.booking.updateMany({
      where: { transactionId: reference, status: BookingStatus.PENDING },
      data: { status: BookingStatus.CANCELLED },
    });
  }

  async cancelRsvp(userId: string, bookingId: string): Promise<any> {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.userId !== userId) {
      throw serviceError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }
    if (booking.status === BookingStatus.CHECKED_IN) {
      throw serviceError('Checked-in bookings cannot be cancelled', 400, 'ALREADY_CHECKED_IN');
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw serviceError('Booking is not active', 400, 'BOOKING_NOT_ACTIVE');
    }
    const eventForCancellation = await prisma.event.findUnique({
      where: { id: booking.eventId },
      select: { startDate: true },
    });
    if (eventForCancellation && eventForCancellation.startDate <= new Date()) {
      throw serviceError('Tickets cannot be cancelled after the event starts', 400, 'EVENT_STARTED');
    }

    return prisma.$transaction(async tx => {
      const event = await tx.event.findUnique({ where: { id: booking.eventId } });
      if (!event) {
        throw serviceError('Event not found', 404, 'EVENT_NOT_FOUND');
      }
      const ticketsSold = Math.max(0, (event.ticketsSold || 0) - booking.ticketCount);
      await tx.event.update({
        where: { id: event.id },
        data: {
          ticketsSold,
          ticketsAvailable: (event.capacity || 0) > 0 ? (event.capacity || 0) - ticketsSold : null,
        },
      });
      return tx.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.CANCELLED },
        include: { event: true },
      });
    });
  }

  async listMyTickets(userId: string): Promise<any[]> {
    const tickets = await prisma.booking.findMany({
      where: {
        userId,
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] },
      },
      include: { event: { select: eventTicketSelect } },
      orderBy: { event: { startDate: 'asc' } },
    });
    const pendingTransfers = await prisma.ticketTransfer.findMany({
      where: {
        bookingId: { in: tickets.map(ticket => ticket.id) },
        status: 'PENDING',
      },
      select: { id: true, bookingId: true, toEmail: true, expiresAt: true },
    });
    const pendingByBooking = new Map(pendingTransfers.map(transfer => [transfer.bookingId, transfer]));
    return tickets.map(ticket => {
      const pendingTransfer = pendingByBooking.get(ticket.id);
      return pendingTransfer
        ? {
            ...ticket,
            pendingTransfer: {
              id: pendingTransfer.id,
              toEmail: pendingTransfer.toEmail,
              expiresAt: pendingTransfer.expiresAt,
            },
          }
        : ticket;
    });
  }

  async getBooking(bookingId: string, userId: string, role: string): Promise<any> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { event: true, user: { select: { id: true, name: true, email: true } } },
    });
    if (!booking || (booking.userId !== userId && role !== 'ADMIN')) {
      throw serviceError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }
    return booking;
  }

  async checkIn(code: string, staffUserId: string, eventId?: string): Promise<any> {
    const bookingId = await this.verifyTicketCode(code);
    if (!bookingId) {
      throw serviceError('Invalid ticket code', 404, 'INVALID_TICKET');
    }
    const [booking, staff] = await Promise.all([
      prisma.booking.findUnique({ where: { id: bookingId }, include: { event: true } }),
      prisma.user.findUnique({
        where: { id: staffUserId },
        select: { role: true, isOrganizer: true },
      }),
    ]);
    if (!booking) {
      throw serviceError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }
    if (!staff || (
      staff.role !== 'ADMIN'
      && !(booking.event.organizerId === staffUserId && staff.isOrganizer)
    )) {
      throw serviceError('You are not authorized to check in attendees', 403, 'FORBIDDEN');
    }
    if (eventId && booking.eventId !== eventId) {
      throw serviceError('Ticket is for a different event', 409, 'WRONG_EVENT', {
        eventTitle: booking.event.title,
      });
    }
    if (booking.status === BookingStatus.CHECKED_IN) {
      throw serviceError('Ticket has already been checked in', 409, 'ALREADY_CHECKED_IN', {
        checkedInAt: booking.checkedInAt,
      });
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw serviceError('Booking is not confirmed', 409, 'BOOKING_NOT_CONFIRMED');
    }
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: BookingStatus.CHECKED_IN,
        checkedInAt: new Date(),
        checkedInBy: staffUserId,
      },
      include: { event: true, user: { select: { id: true, name: true, email: true } } },
    });
    void recordSignal(updated.userId, 'attend', { eventId: updated.eventId });
    return {
      booking: updated,
      attendee: updated.user,
      eventTitle: updated.event.title,
      ticketCount: updated.ticketCount,
    };
  }

  async eventAttendance(eventId: string, staffUserId: string): Promise<any> {
    const [event, staff] = await Promise.all([
      prisma.event.findUnique({ where: { id: eventId }, select: { organizerId: true, capacity: true } }),
      prisma.user.findUnique({
        where: { id: staffUserId },
        select: { role: true, isOrganizer: true },
      }),
    ]);
    if (!event) {
      throw serviceError('Event not found', 404, 'EVENT_NOT_FOUND');
    }
    if (!staff || (
      staff.role !== 'ADMIN'
      && !(event.organizerId === staffUserId && staff.isOrganizer)
    )) {
      throw serviceError('You are not authorized to view attendance', 403, 'FORBIDDEN');
    }
    const [confirmed, checkedIn] = await Promise.all([
      prisma.booking.count({ where: { eventId, status: BookingStatus.CONFIRMED } }),
      prisma.booking.count({ where: { eventId, status: BookingStatus.CHECKED_IN } }),
    ]);
    return { confirmed, checkedIn, capacity: event.capacity || 0 };
  }
}

export const ticketsService = new TicketsService();
export default ticketsService;
