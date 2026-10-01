import { Prisma } from '@prisma/client';
import prisma from '../database/prisma';
import { eventService } from './events.service';

const bookedStatuses = ['CONFIRMED', 'CHECKED_IN'] as const;

export type ProfileEventType = 'upcoming' | 'past' | 'attended' | 'hosted';

const profileTarget = async (userId: string, viewerRole?: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      displayName: true,
      avatar: true,
      avatarUrl: true,
      coverImage: true,
      bio: true,
      isPrivate: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });
  if (!user || (user.status === 'PAUSED' && viewerRole !== 'ADMIN')) return null;
  return user;
};

const visibleEventStatus = (includeBanned: boolean): Prisma.EventWhereInput => ({
  status: includeBanned ? { in: ['ACTIVE', 'BANNED'] } : 'ACTIVE',
});

const canViewPrivateProfile = async (
  user: { id: string; isPrivate: boolean },
  viewerId: string,
  viewerRole?: string,
) => {
  if (!user.isPrivate || viewerId === user.id || viewerRole === 'ADMIN') return true;
  return Boolean(await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: user.id } },
    select: { followerId: true },
  }));
};

export async function getUserProfile(userId: string, viewerId: string, viewerRole?: string) {
  const user = await profileTarget(userId, viewerRole);
  if (!user) return null;

  const now = new Date();
  const includeBanned = viewerId === userId || viewerRole === 'ADMIN';
  const membership: Prisma.EventWhereInput = {
    OR: [
      { organizerId: userId },
      {
        bookings: {
          some: {
            userId,
            status: { in: [...bookedStatuses] },
          },
        },
      },
    ],
  };
  const [followers, following, upcoming, past, attended, hosted, reviews, followsTarget, targetFollowsViewer, followRequest, pendingRequests] = await Promise.all([
    prisma.follow.count({ where: { followingId: userId, follower: { status: 'ACTIVE' } } }),
    prisma.follow.count({ where: { followerId: userId, following: { status: 'ACTIVE' } } }),
    prisma.event.count({
      where: {
        AND: [
          visibleEventStatus(includeBanned),
          membership,
          { OR: [{ endDate: { gte: now } }, { endDate: null, startDate: { gte: now } }] },
        ],
      },
    }),
    prisma.event.count({
      where: {
        AND: [
          visibleEventStatus(includeBanned),
          membership,
          { OR: [{ endDate: { lt: now } }, { endDate: null, startDate: { lt: now } }] },
        ],
      },
    }),
    prisma.event.count({
      where: {
        AND: [
          visibleEventStatus(includeBanned),
          { bookings: { some: { userId, status: 'CHECKED_IN' } } },
        ],
      },
    }),
    prisma.event.count({ where: { ...visibleEventStatus(includeBanned), organizerId: userId } }),
    prisma.review.count({ where: { userId } }),
    prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: userId } },
      select: { followerId: true },
    }),
    prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: viewerId } },
      select: { followerId: true },
    }),
    viewerId
      ? prisma.followRequest.findUnique({
        where: { requesterId_targetId: { requesterId: viewerId, targetId: userId } },
        select: { requesterId: true },
      })
      : null,
    viewerId === userId
      ? prisma.followRequest.count({ where: { targetId: userId, requester: { status: 'ACTIVE' } } })
      : 0,
  ]);

  return {
    user: {
      id: user.id,
      name: user.displayName || user.name || '',
      avatar: user.avatar || user.avatarUrl || null,
      coverImage: user.coverImage,
      bio: user.bio,
      isPrivate: user.isPrivate,
      role: user.role,
      createdAt: user.createdAt,
    },
    counts: { followers, following, upcoming, past, attended, hosted, reviews },
    isMe: viewerId === userId,
    isFollowing: Boolean(followsTarget),
    followRequested: Boolean(followRequest),
    followsYou: Boolean(targetFollowsViewer),
    canViewContent: !user.isPrivate || viewerId === userId || viewerRole === 'ADMIN' || Boolean(followsTarget),
    ...(viewerId === userId ? { pendingRequests } : {}),
  };
}

export async function listUserConnections(
  userId: string,
  viewerId: string,
  viewerRole: string | undefined,
  type: 'followers' | 'following',
  page: number,
  pageSize: number,
) {
  const target = await profileTarget(userId, viewerRole);
  if (!target) return null;
  if (!await canViewPrivateProfile(target, viewerId, viewerRole)) return { error: 'PROFILE_PRIVATE' as const };

  const where: Prisma.FollowWhereInput = type === 'followers'
    ? { followingId: userId, follower: { status: 'ACTIVE' } }
    : { followerId: userId, following: { status: 'ACTIVE' } };
  const [total, rows] = await Promise.all([
    prisma.follow.count({ where }),
    type === 'followers'
      ? prisma.follow.findMany({
        where,
        select: {
          createdAt: true,
          follower: { select: { id: true, name: true, displayName: true, avatar: true, avatarUrl: true, bio: true, isPrivate: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      })
      : prisma.follow.findMany({
        where,
        select: {
          createdAt: true,
          following: { select: { id: true, name: true, displayName: true, avatar: true, avatarUrl: true, bio: true, isPrivate: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
  ]);
  const users = type === 'followers'
    ? rows.map(row => (row as any).follower)
    : rows.map(row => (row as any).following);
  const followed = users.length
    ? await prisma.follow.findMany({
      where: { followerId: viewerId, followingId: { in: users.map((user: any) => user.id) } },
      select: { followingId: true },
    })
    : [];
  const followingIds = new Set(followed.map(row => row.followingId));
  const requested = users.length
    ? await prisma.followRequest.findMany({
      where: { requesterId: viewerId, targetId: { in: users.map((user: any) => user.id) } },
      select: { targetId: true },
    })
    : [];
  const requestedIds = new Set(requested.map(row => row.targetId));

  return {
    items: users.map((person: any) => ({
      id: person.id,
      name: person.displayName || person.name || '',
      avatar: person.avatar || person.avatarUrl || null,
      bio: person.bio,
      isPrivate: person.isPrivate,
      isFollowing: followingIds.has(person.id),
      followRequested: requestedIds.has(person.id),
      isMe: person.id === viewerId,
    })),
    total,
  };
}

export async function listUserEvents(
  userId: string,
  viewerId: string,
  viewerRole: string | undefined,
  type: ProfileEventType,
  page: number,
  pageSize = 20,
) {
  const target = await profileTarget(userId, viewerRole);
  if (!target) return null;
  if (!await canViewPrivateProfile(target, viewerId, viewerRole)) return { error: 'PROFILE_PRIVATE' as const };

  const now = new Date();
  const includeBanned = viewerId === userId || viewerRole === 'ADMIN';
  const conditions: Prisma.EventWhereInput[] = [visibleEventStatus(includeBanned)];
  if (type === 'upcoming' || type === 'past') {
    conditions.push({
      OR: [
        { organizerId: userId },
        { bookings: { some: { userId, status: { in: [...bookedStatuses] } } } },
      ],
    });
    conditions.push(type === 'upcoming'
      ? { OR: [{ endDate: { gte: now } }, { endDate: null, startDate: { gte: now } }] }
      : { OR: [{ endDate: { lt: now } }, { endDate: null, startDate: { lt: now } }] });
  } else if (type === 'attended') {
    conditions.push({ bookings: { some: { userId, status: 'CHECKED_IN' } } });
  } else {
    conditions.push({ organizerId: userId });
  }

  const where: Prisma.EventWhereInput = { AND: conditions };
  const eventSelect: any = eventService.getEventSelectFields(viewerId);
  eventSelect.bookings = {
    where: { userId, status: { in: [...bookedStatuses] } },
    select: { status: true },
  };
  const [total, events] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      select: eventSelect,
      orderBy: { startDate: type === 'upcoming' ? 'asc' : 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: events.map((event: any) => {
      const checkedIn = event.bookings?.some((booking: any) => booking.status === 'CHECKED_IN');
      const relation = type === 'hosted' || event.organizerId === userId
        ? 'hosting'
        : type === 'attended' || checkedIn
          ? 'attended'
          : 'going';
      return { ...eventService.formatEventResponse(event, viewerId), relation };
    }),
    total,
  };
}
