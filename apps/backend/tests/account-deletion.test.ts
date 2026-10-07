import 'dotenv/config';
import { AddressInfo } from 'net';
import app from '../src/app';
import prisma from '../src/database/prisma';
import { authService } from '../src/services/auth.service';

describe('DELETE /api/users/me', () => {
  const password = 'DeleteTest2026!';
  const email = `account-deletion-${Date.now()}@example.com`;
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;
  let userId: string;
  let accessToken: string;
  let eventId: string | undefined;
  let pastEventId: string | undefined;
  let guestId: string | undefined;

  const deleteAccount = (secret: string) => fetch(`${baseUrl}/api/users/me`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: secret }),
  });

  beforeAll(async () => {
    await prisma.$connect();
    server = app.listen(0);
    await new Promise<void>(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const registered = await authService.registerWithEmail(email, password, 'Account deletion test');
    userId = registered.user.id;
    accessToken = registered.tokens.accessToken;
  });

  afterAll(async () => {
    const eventIds = [eventId, pastEventId].filter(Boolean) as string[];
    if (eventIds.length) {
      await prisma.booking.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    }
    if (guestId) {
      await prisma.refreshToken.deleteMany({ where: { userId: guestId } });
      await prisma.user.deleteMany({ where: { id: guestId } });
    }
    if (userId) {
      await prisma.refreshToken.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  });

  it('blocks deletion while a hosted event has a confirmed guest booking', async () => {
    const guest = await authService.registerWithEmail(
      `account-deletion-guest-${Date.now()}@example.com`,
      'GuestTest2026!',
      'Account deletion guest',
    );
    guestId = guest.user.id;
    const event = await prisma.event.create({
      data: {
        title: 'Account deletion hosted event test',
        description: 'Temporary hosted-event integration test',
        category: 'Test',
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        organizerId: userId,
        status: 'ACTIVE',
        isFree: true,
      },
      select: { id: true },
    });
    eventId = event.id;
    await prisma.booking.create({
      data: {
        userId: guestId,
        eventId,
        status: 'CONFIRMED',
        totalAmount: 0,
        currency: 'AED',
      },
    });

    const hostedEventConflict = await deleteAccount(password);
    expect(hostedEventConflict.status).toBe(409);
    expect((await hostedEventConflict.json()).code).toBe('UPCOMING_HOSTED_EVENTS');

    await prisma.booking.deleteMany({ where: { eventId } });
    await prisma.event.delete({ where: { id: eventId } });
    eventId = undefined;
    await prisma.refreshToken.deleteMany({ where: { userId: guestId } });
    await prisma.user.delete({ where: { id: guestId } });
    guestId = undefined;
  });

  it('rejects a wrong password, blocks upcoming paid bookings, then anonymizes and revokes the old token', async () => {
    const wrongPassword = await deleteAccount('WrongPassword2026!');
    expect(wrongPassword.status).toBe(401);
    expect((await wrongPassword.json()).code).toBe('INVALID_PASSWORD');

    const event = await prisma.event.create({
      data: {
        title: 'Account deletion paid booking test',
        description: 'Temporary account deletion integration test',
        category: 'Test',
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        organizerId: userId,
        status: 'ACTIVE',
        isFree: false,
      },
      select: { id: true },
    });
    eventId = event.id;
    await prisma.booking.create({
      data: {
        userId,
        eventId,
        status: 'CONFIRMED',
        totalAmount: 10,
        currency: 'AED',
      },
    });

    const paidBookingConflict = await deleteAccount(password);
    expect(paidBookingConflict.status).toBe(409);
    expect((await paidBookingConflict.json()).code).toBe('UPCOMING_PAID_BOOKINGS');

    await prisma.booking.deleteMany({ where: { eventId } });
    await prisma.event.delete({ where: { id: eventId } });
    eventId = undefined;

    const freeEvent = await prisma.event.create({
      data: {
        title: 'Account deletion free booking test',
        description: 'Temporary free-booking integration test',
        category: 'Test',
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        organizerId: userId,
        status: 'ACTIVE',
        isFree: true,
      },
      select: { id: true },
    });
    eventId = freeEvent.id;
    await prisma.booking.create({
      data: {
        userId,
        eventId,
        status: 'CONFIRMED',
        totalAmount: 0,
        currency: 'AED',
      },
    });
    const pastEvent = await prisma.event.create({
      data: {
        title: 'Account deletion past payment test',
        description: 'Temporary past-payment integration test',
        category: 'Test',
        startDate: new Date(Date.now() - 48 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        organizerId: userId,
        status: 'ACTIVE',
        isFree: false,
      },
      select: { id: true },
    });
    pastEventId = pastEvent.id;
    await prisma.booking.create({
      data: {
        userId,
        eventId: pastEventId,
        status: 'CONFIRMED',
        totalAmount: 10,
        currency: 'AED',
      },
    });

    const deletion = await deleteAccount(password);
    expect(deletion.status).toBe(200);
    expect((await deletion.json()).data.deleted).toBe(true);

    const deletedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, password: true, status: true, isPrivate: true, deletedAt: true },
    });
    expect(deletedUser).toMatchObject({
      email: null,
      name: 'Deleted user',
      password: null,
      status: 'DELETED',
      isPrivate: true,
    });
    expect(deletedUser?.deletedAt).toBeInstanceOf(Date);

    const oldToken = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(oldToken.status).toBe(401);

    const [cancelledFreeBooking, retainedPastBooking] = await Promise.all([
      prisma.booking.findFirst({ where: { userId, eventId } }),
      prisma.booking.findFirst({ where: { userId, eventId: pastEventId } }),
    ]);
    expect(cancelledFreeBooking?.status).toBe('CANCELLED');
    expect(retainedPastBooking?.status).toBe('CONFIRMED');
    expect(retainedPastBooking?.totalAmount.toString()).toBe('10');
  });
});
