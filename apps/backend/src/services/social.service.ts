import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { eventService } from './events.service';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const goingStatuses = ['CONFIRMED', 'CHECKED_IN'] as const;

export type PublicUser = {
  id: string;
  name: string | null;
  avatar: string | null;
};

const publicUser = (user: { id: string; name: string | null; avatar: string | null; avatarUrl?: string | null }): PublicUser => ({
  id: user.id,
  name: user.name,
  avatar: user.avatar || user.avatarUrl || null,
});

const cleanBase = (value: string): string => value.replace(/\/+$/, '');

const dateParts = (date: Date) => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dubai',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).formatToParts(date).reduce<Record<string, string>>((result, part) => {
  if (part.type !== 'literal') result[part.type] = part.value;
  return result;
}, {});

export const formatShareDate = (date: Date): string => {
  const parts = dateParts(date);
  return `${parts.weekday}, ${parts.day} ${parts.month} · ${parts.hour}:${parts.minute}`;
};

const formatMessageDate = (date: Date): string => {
  const parts = dateParts(date);
  return `${parts.day} ${parts.month} ${parts.year || ''}`.trim();
};

const eventVenue = (event: { venueName: string | null; city: string | null }): string => (
  event.venueName || event.city || 'TBA'
);

export const buildShareLinks = (
  event: { id: string; title: string; startDate: Date; venueName: string | null; city: string | null },
  code: string,
  webBase: string,
) => {
  const base = cleanBase(webBase);
  const shareUrl = `${base}/e/${encodeURIComponent(event.id)}?ref=${encodeURIComponent(code)}`;
  const text = `${event.title} — ${formatMessageDate(event.startDate)}, ${eventVenue(event)}. Join me on Migo: ${shareUrl}`;
  return {
    shareUrl,
    whatsappUrl: `https://wa.me/?text=${encodeURIComponent(text)}`,
  };
};

export const generateInviteCode = (): string => {
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, byte => BASE62[byte % BASE62.length]).join('');
};

export const findInviteForEvent = async (eventId: string, code?: string | null) => {
  if (!code || code.length > 16) return null;
  return prisma.eventInvite.findFirst({ where: { eventId, code } });
};

export const createEventInvite = async (
  eventId: string,
  inviterId: string,
  webBase: string,
) => {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, startDate: true, venueName: true, city: true },
  });
  if (!event) return null;

  const existing = await prisma.eventInvite.findUnique({
    where: { eventId_inviterId: { eventId, inviterId } },
  });
  let invite = existing;
  for (let attempt = 0; !invite && attempt < 5; attempt += 1) {
    try {
      invite = await prisma.eventInvite.create({
        data: { eventId, inviterId, code: generateInviteCode() },
      });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
    }
  }
  if (!invite) throw new Error('Unable to create invite');

  return {
    code: invite.code,
    ...buildShareLinks(event, invite.code, webBase),
  };
};

const isHidden = (preferences: Prisma.JsonValue | null): boolean => (
  Boolean(
    preferences
    && typeof preferences === 'object'
    && !Array.isArray(preferences)
    && (preferences as Prisma.JsonObject).hideFromAttendees === true,
  )
);

export const getEventSocial = async (eventId: string, userId?: string) => {
  const [aggregate, bookings] = await Promise.all([
    prisma.booking.aggregate({
      where: { eventId, status: { in: [...goingStatuses] } },
      _sum: { ticketCount: true },
    }),
    prisma.booking.findMany({
      where: { eventId, status: { in: [...goingStatuses] } },
      select: {
        bookingDate: true,
        user: { select: { id: true, name: true, avatar: true, avatarUrl: true, preferences: true } },
      },
      orderBy: { bookingDate: 'desc' },
      take: 20,
    }),
  ]);

  const attendeesPreview = bookings
    .filter(booking => !isHidden(booking.user.preferences))
    .slice(0, 5)
    .map(booking => publicUser(booking.user));

  let friendsGoing: PublicUser[] = [];
  if (userId) {
    const follows = await prisma.follow.findMany({
      where: {
        followerId: userId,
        following: {
          bookings: { some: { eventId, status: { in: [...goingStatuses] } } },
        },
      },
      select: {
        following: { select: { id: true, name: true, avatar: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    friendsGoing = follows.map(follow => publicUser(follow.following));
  }

  return {
    goingCount: aggregate._sum.ticketCount || 0,
    attendeesPreview,
    friendsGoing,
  };
};

export const getFriendsGoingEvents = async (userId: string, limit = 10) => {
  const bookings = await prisma.booking.findMany({
    where: {
      status: { in: [...goingStatuses] },
      event: {
        status: 'ACTIVE',
        visibility: 'PUBLIC',
        startDate: { gte: new Date() },
      },
      user: {
        followers: { some: { followerId: userId } },
      },
    },
    select: {
      eventId: true,
      event: {
        select: eventService.getEventSelectFields(userId),
      },
      user: {
        select: { id: true, name: true, avatar: true, avatarUrl: true },
      },
    },
  });

  const grouped = new Map<string, {
    event: any;
    friends: PublicUser[];
    friendIds: Set<string>;
  }>();

  bookings.forEach(({ eventId, event, user }) => {
    const existing = grouped.get(eventId);
    const friend = publicUser(user);
    if (existing) {
      if (!existing.friendIds.has(friend.id)) {
        existing.friendIds.add(friend.id);
        if (existing.friends.length < 5) existing.friends.push(friend);
      }
      return;
    }
    grouped.set(eventId, {
      event,
      friends: [friend],
      friendIds: new Set([friend.id]),
    });
  });

  return Array.from(grouped.values())
    .sort((a, b) => (
      b.friendIds.size - a.friendIds.size
      || new Date(a.event.startDate).getTime() - new Date(b.event.startDate).getTime()
    ))
    .slice(0, limit)
    .map(({ event, friends, friendIds }) => ({
      ...eventService.formatEventResponse(event, userId),
      friendsGoing: friends,
      friendsGoingCount: friendIds.size,
    }));
};

export const searchUsers = async (userId: string, query: string) => {
  const q = query.trim();
  if (q.length < 2) return [];
  const users = await prisma.user.findMany({
    where: {
      id: { not: userId },
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { equals: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, avatar: true, avatarUrl: true },
    take: 20,
    orderBy: { name: 'asc' },
  });
  const follows = await prisma.follow.findMany({
    where: { followerId: userId, followingId: { in: users.map(user => user.id) } },
    select: { followingId: true },
  });
  const following = new Set(follows.map(follow => follow.followingId));
  return users.map(user => ({ ...publicUser(user), isFollowing: following.has(user.id) }));
};

export const suggestedUsers = async (userId: string) => {
  const users = await prisma.user.findMany({
    where: {
      id: { not: userId },
      email: { not: 'system@migo.events' },
      isAdmin: false,
      followers: { none: { followerId: userId } },
    },
    select: {
      id: true,
      name: true,
      avatar: true,
      avatarUrl: true,
      _count: {
        select: {
          bookings: { where: { status: 'CONFIRMED' } },
        },
      },
      bookings: {
        where: {
          status: 'CONFIRMED',
          event: { startDate: { gte: new Date() } },
        },
        select: { id: true },
      },
    },
    orderBy: [
      { bookings: { _count: 'desc' } },
      { name: 'asc' },
    ],
    take: 20,
  });

  return users.map(user => ({
    ...publicUser(user),
    isFollowing: false,
    goingCount: user.bookings.length,
  }));
};

export const followUser = async (followerId: string, followingId: string) => {
  if (followerId === followingId) return { error: 'SELF_FOLLOW' as const };
  const target = await prisma.user.findUnique({ where: { id: followingId }, select: { id: true } });
  if (!target) return null;
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId, followingId } },
    create: { followerId, followingId },
    update: {},
  });
  return { following: true };
};

export const unfollowUser = async (followerId: string, followingId: string) => {
  if (followerId === followingId) return { error: 'SELF_FOLLOW' as const };
  const target = await prisma.user.findUnique({ where: { id: followingId }, select: { id: true } });
  if (!target) return null;
  await prisma.follow.deleteMany({ where: { followerId, followingId } });
  return { following: false };
};

const listFollowedUsers = async (where: Prisma.FollowWhereInput) => {
  const follows = await prisma.follow.findMany({
    where,
    select: { following: { select: { id: true, name: true, avatar: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return follows.map(follow => publicUser(follow.following));
};

export const listFollowing = (userId: string) => listFollowedUsers({ followerId: userId });

export const listFollowers = async (userId: string) => {
  const follows = await prisma.follow.findMany({
    where: { followingId: userId },
    select: { follower: { select: { id: true, name: true, avatar: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return follows.map(follow => publicUser(follow.follower));
};
