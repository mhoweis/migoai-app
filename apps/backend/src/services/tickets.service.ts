import crypto from 'crypto';
import { BookingStatus, Prisma } from '@prisma/client';
import config from '../config/env';
import prisma from '../database/prisma';
import { AppError } from '../middlewares/error.middleware';

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
    if ((event.capacity || 0) > 0 && (event.ticketsSold || 0) + ticketCount > (event.capacity || 0)) {
      throw serviceError('Event is sold out', 409, 'SOLD_OUT');
    }

    try {
      return await prisma.$transaction(async tx => {
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
    return prisma.booking.findMany({
      where: {
        userId,
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] },
      },
      include: { event: { select: eventTicketSelect } },
      orderBy: { event: { startDate: 'asc' } },
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

  async checkIn(code: string, staffUserId: string): Promise<any> {
    const bookingId = await this.verifyTicketCode(code);
    if (!bookingId) {
      throw serviceError('Invalid ticket code', 404, 'INVALID_TICKET');
    }
    const [booking, staff] = await Promise.all([
      prisma.booking.findUnique({ where: { id: bookingId }, include: { event: true } }),
      prisma.user.findUnique({ where: { id: staffUserId }, select: { role: true } }),
    ]);
    if (!booking) {
      throw serviceError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }
    if (!staff || (staff.role !== 'ADMIN' && booking.event.organizerId !== staffUserId)) {
      throw serviceError('You are not authorized to check in attendees', 403, 'FORBIDDEN');
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
      prisma.user.findUnique({ where: { id: staffUserId }, select: { role: true } }),
    ]);
    if (!event) {
      throw serviceError('Event not found', 404, 'EVENT_NOT_FOUND');
    }
    if (!staff || (staff.role !== 'ADMIN' && event.organizerId !== staffUserId)) {
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
