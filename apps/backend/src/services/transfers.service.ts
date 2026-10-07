import crypto from 'crypto';
import { BookingStatus, TransferStatus } from '@prisma/client';
import config from '../config/env';
import prisma from '../database/prisma';
import { AppError } from '../middlewares/error.middleware';
import ticketsService from './tickets.service';

const transferError = (message: string, statusCode: number, code: string): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.status = statusCode >= 500 ? 'error' : 'fail';
  error.code = code;
  error.isOperational = true;
  return error;
};

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const makeCode = (): string => {
  const bytes = crypto.randomBytes(24);
  return Array.from(bytes, byte => BASE62[byte % BASE62.length]).join('');
};

const webBase = () => (config.APP_PUBLIC_URL || config.APP_URL).replace(/\/+$/, '');

class TransfersService {
  async createTransfer(
    bookingId: string,
    fromUserId: string,
    toEmail: string,
    webBaseUrl = webBase(),
  ): Promise<Record<string, unknown>> {
    const normalizedEmail = toEmail.trim().toLowerCase();
    const [booking, sender] = await Promise.all([
      prisma.booking.findUnique({
        where: { id: bookingId },
        include: { event: true },
      }),
      prisma.user.findUnique({ where: { id: fromUserId }, select: { email: true } }),
    ]);
    if (!booking || booking.userId !== fromUserId) {
      throw transferError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw transferError('Only confirmed tickets can be transferred', 400, 'BOOKING_NOT_TRANSFERABLE');
    }
    if (booking.event.startDate <= new Date()) {
      throw transferError('This event has already started', 400, 'EVENT_STARTED');
    }
    if (!normalizedEmail || normalizedEmail === sender?.email?.toLowerCase()) {
      throw transferError('A different recipient email is required', 400, 'INVALID_RECIPIENT');
    }
    const pending = await prisma.ticketTransfer.findFirst({
      where: { bookingId, status: TransferStatus.PENDING },
    });
    if (pending) {
      throw transferError('Cancel the pending transfer first', 409, 'TRANSFER_PENDING');
    }
    const recipient = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      select: { id: true },
    });
    const expiresAt = new Date(Math.min(
      Date.now() + 72 * 60 * 60 * 1000,
      booking.event.startDate.getTime(),
    ));
    const transfer = await prisma.ticketTransfer.create({
      data: {
        bookingId,
        fromUserId,
        toUserId: recipient?.id,
        toEmail: normalizedEmail,
        code: makeCode(),
        expiresAt,
      },
    });
    const claimUrl = `${webBaseUrl.replace(/\/+$/, '')}/?transfer=${encodeURIComponent(transfer.code)}`;
    const text = `I'm sending you my ticket for ${booking.event.title} — accept it in Migo: ${claimUrl}`;
    return {
      id: transfer.id,
      code: transfer.code,
      toEmail: transfer.toEmail,
      expiresAt: transfer.expiresAt,
      claimUrl,
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(text)}`,
    };
  }

  async acceptTransfer(code: string, userId: string): Promise<any> {
    const transfer = await prisma.ticketTransfer.findUnique({
      where: { code },
      include: {
        booking: { include: { event: true } },
        toUser: { select: { email: true } },
      },
    });
    if (!transfer) throw transferError('Transfer not found', 404, 'TRANSFER_NOT_FOUND');
    if (transfer.status !== TransferStatus.PENDING || transfer.expiresAt <= new Date()) {
      if (transfer.status === TransferStatus.PENDING) {
        await prisma.ticketTransfer.update({
          where: { id: transfer.id },
          data: { status: TransferStatus.EXPIRED },
        });
      }
      throw transferError('This transfer has expired', 410, 'TRANSFER_EXPIRED');
    }
    const recipient = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!recipient || (
      transfer.toUserId !== userId
      && transfer.toEmail.toLowerCase() !== recipient.email?.toLowerCase()
    )) {
      throw transferError('You are not the intended recipient', 403, 'FORBIDDEN');
    }
    const existing = await prisma.booking.findUnique({
      where: { userId_eventId: { userId, eventId: transfer.booking.eventId } },
      select: { id: true, status: true },
    });
    if (existing && existing.status !== BookingStatus.CANCELLED && existing.status !== BookingStatus.REFUNDED) {
      throw transferError('You already have a ticket for this event', 409, 'ALREADY_BOOKED');
    }
    return prisma.$transaction(async tx => {
      const qrCode = ticketsService.signTicket(
        transfer.booking.id,
        transfer.booking.eventId,
        userId,
      );
      const booking = await tx.booking.update({
        where: { id: transfer.booking.id },
        data: {
          userId,
          qrCode,
          attendeeName: recipient.name || undefined,
          attendeeEmail: recipient.email || undefined,
          checkedInAt: null,
          checkedInBy: null,
        },
        include: { event: true },
      });
      await tx.ticketTransfer.update({
        where: { id: transfer.id },
        data: { status: TransferStatus.ACCEPTED, toUserId: userId, acceptedAt: new Date() },
      });
      return booking;
    });
  }

  async cancelTransfer(id: string, fromUserId: string): Promise<void> {
    const transfer = await prisma.ticketTransfer.findUnique({ where: { id } });
    if (!transfer || transfer.fromUserId !== fromUserId) {
      throw transferError('Transfer not found', 404, 'TRANSFER_NOT_FOUND');
    }
    if (transfer.status !== TransferStatus.PENDING) {
      throw transferError('Transfer is no longer pending', 400, 'TRANSFER_NOT_PENDING');
    }
    await prisma.ticketTransfer.update({
      where: { id },
      data: { status: TransferStatus.CANCELLED },
    });
  }

  async getTransferByCode(code: string, userId: string): Promise<Record<string, unknown>> {
    const transfer = await prisma.ticketTransfer.findUnique({
      where: { code },
      include: {
        booking: { include: { event: true } },
        fromUser: { select: { name: true } },
      },
    });
    if (!transfer) throw transferError('Transfer not found', 404, 'TRANSFER_NOT_FOUND');
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const canAccept = transfer.toUserId === userId
      || transfer.toEmail.toLowerCase() === user?.email?.toLowerCase();
    if (transfer.fromUserId !== userId && !canAccept) {
      throw transferError('You are not the intended recipient', 403, 'FORBIDDEN');
    }
    if (transfer.status === TransferStatus.PENDING && transfer.expiresAt <= new Date()) {
      await prisma.ticketTransfer.update({
        where: { id: transfer.id },
        data: { status: TransferStatus.EXPIRED },
      });
      transfer.status = TransferStatus.EXPIRED;
    }
    return {
      eventTitle: transfer.booking.event.title,
      startDate: transfer.booking.event.startDate,
      venue: transfer.booking.event.venueName || transfer.booking.event.city || 'Migo event',
      fromName: transfer.fromUser.name,
      status: transfer.status,
      expiresAt: transfer.expiresAt,
      canAccept: canAccept && transfer.status === TransferStatus.PENDING,
    };
  }
}

export const transfersService = new TransfersService();
export default transfersService;
