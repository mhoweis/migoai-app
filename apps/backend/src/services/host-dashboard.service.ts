import prisma from '../database/prisma';

const ATTENDANCE_STATUSES = ['CONFIRMED', 'CHECKED_IN'] as const;

const startOfIsoWeek = (date: Date): Date => {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - ((day + 6) % 7));
  return start;
};

const userName = (user: { displayName: string | null; name: string | null; email?: string | null }): string =>
  user.displayName || user.name || user.email || 'Migo member';

export async function getHostDashboard(userId: string) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const events = await prisma.event.findMany({
    where: { organizerId: userId, status: { not: 'DELETED' } },
    orderBy: { startDate: 'desc' },
    select: {
      id: true,
      title: true,
      coverImage: true,
      startDate: true,
      endDate: true,
      status: true,
      venueName: true,
      capacity: true,
    },
  });
  const eventIds = events.map(event => event.id);

  const [followers, following, recentFollows, bookingGroups, wishlistGroups, viewGroups, invites] = await Promise.all([
    prisma.follow.findMany({
      where: { followingId: userId },
      select: { followerId: true, createdAt: true },
    }),
    prisma.follow.count({ where: { followerId: userId } }),
    prisma.follow.findMany({
      where: { followingId: userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        createdAt: true,
        follower: {
          select: { id: true, name: true, displayName: true, email: true, avatar: true, avatarUrl: true },
        },
      },
    }),
    eventIds.length
      ? prisma.booking.groupBy({
          by: ['eventId', 'status'],
          where: { eventId: { in: eventIds }, status: { in: [...ATTENDANCE_STATUSES] } },
          _sum: { ticketCount: true },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    eventIds.length
      ? prisma.wishlist.groupBy({
          by: ['eventId'],
          where: { eventId: { in: eventIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    eventIds.length
      ? prisma.userSignal.groupBy({
          by: ['eventId'],
          where: { eventId: { in: eventIds }, type: 'view' },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    eventIds.length
      ? prisma.eventInvite.findMany({
          where: { eventId: { in: eventIds }, inviterId: userId },
          select: { eventId: true, code: true },
        })
      : Promise.resolve([]),
  ]);

  const followerIds = [...new Set(followers.map(follow => follow.followerId))];
  const [reverseFollows, attendingFollowerGroups, repeatAttendeeGroups] = await Promise.all([
    followerIds.length
      ? prisma.follow.findMany({
          where: { followerId: userId, followingId: { in: followerIds } },
          select: { followingId: true },
        })
      : Promise.resolve([]),
    followerIds.length && eventIds.length
      ? prisma.booking.groupBy({
          by: ['userId'],
          where: {
            userId: { in: followerIds },
            eventId: { in: eventIds },
            status: { in: [...ATTENDANCE_STATUSES] },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    eventIds.length
      ? prisma.booking.groupBy({
          by: ['userId'],
          where: { eventId: { in: eventIds }, status: { in: [...ATTENDANCE_STATUSES] } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const statsByEvent = new Map<string, { registered: number; checkedIn: number; bookings: number; saves: number; views: number; invited: number }>();
  for (const eventId of eventIds) {
    statsByEvent.set(eventId, { registered: 0, checkedIn: 0, bookings: 0, saves: 0, views: 0, invited: 0 });
  }
  for (const group of bookingGroups) {
    const stats = statsByEvent.get(group.eventId);
    if (!stats) continue;
    const tickets = group._sum.ticketCount || 0;
    stats.registered += tickets;
    stats.bookings += group._count._all;
    if (group.status === 'CHECKED_IN') stats.checkedIn += tickets;
  }
  for (const group of wishlistGroups) {
    const stats = statsByEvent.get(group.eventId);
    if (stats) stats.saves = group._count._all;
  }
  for (const group of viewGroups) {
    if (!group.eventId) continue;
    const stats = statsByEvent.get(group.eventId);
    if (stats) stats.views = group._count._all;
  }

  const inviteCodesByEvent = new Map<string, Set<string>>();
  const allInviteCodes: string[] = [];
  for (const invite of invites) {
    const codes = inviteCodesByEvent.get(invite.eventId) || new Set<string>();
    codes.add(invite.code);
    inviteCodesByEvent.set(invite.eventId, codes);
    allInviteCodes.push(invite.code);
  }
  if (allInviteCodes.length) {
    const invitedBookings = await prisma.booking.findMany({
      where: { eventId: { in: eventIds }, inviteCode: { in: allInviteCodes } },
      select: { eventId: true, inviteCode: true },
    });
    for (const booking of invitedBookings) {
      const codes = inviteCodesByEvent.get(booking.eventId);
      if (!booking.inviteCode || !codes?.has(booking.inviteCode)) continue;
      const stats = statsByEvent.get(booking.eventId);
      if (stats) stats.invited += 1;
    }
  }

  const recentFollowerSet = new Set(reverseFollows.map(follow => follow.followingId));
  const attendingFollowerCount = attendingFollowerGroups.length;
  const repeatAttendees = repeatAttendeeGroups
    .filter(group => group._count._all >= 2)
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 10);
  const attendeeIds = repeatAttendees.map(group => group.userId);
  const attendeeUsers = attendeeIds.length
    ? await prisma.user.findMany({
        where: { id: { in: attendeeIds } },
        select: { id: true, name: true, displayName: true, email: true, avatar: true, avatarUrl: true },
      })
    : [];
  const attendeeById = new Map(attendeeUsers.map(user => [user.id, user]));

  const currentWeekStart = startOfIsoWeek(now);
  const weekStarts = Array.from({ length: 8 }, (_, index) => {
    const date = new Date(currentWeekStart);
    date.setUTCDate(date.getUTCDate() - (7 - index) * 7);
    return date;
  });
  const firstWeekStart = weekStarts[0];
  const createdBeforeWeeks = followers.filter(follow => follow.createdAt < firstWeekStart).length;
  let cumulativeFollowers = createdBeforeWeeks;
  const followerGrowth = weekStarts.map((weekStart, index) => {
    const nextWeek = new Date(weekStart);
    nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
    const newFollowers = followers.filter(follow => follow.createdAt >= weekStart && follow.createdAt < nextWeek).length;
    cumulativeFollowers += newFollowers;
    return {
      weekStart: weekStart.toISOString().slice(0, 10),
      newFollowers,
      total: cumulativeFollowers,
    };
  });

  const dashboardEvents = events.map(event => {
    const stats = statsByEvent.get(event.id)!;
    const isPast = (event.endDate || event.startDate) < now;
    return {
      ...event,
      ...stats,
      checkInRate: stats.registered ? stats.checkedIn / stats.registered : 0,
      isPast,
    };
  });
  const pastEvents = dashboardEvents.filter(event => event.isPast);
  const registered = dashboardEvents.reduce((sum, event) => sum + event.registered, 0);
  const checkedIn = dashboardEvents.reduce((sum, event) => sum + event.checkedIn, 0);
  const pastRegistered = pastEvents.reduce((sum, event) => sum + event.registered, 0);
  const pastCheckedIn = pastEvents.reduce((sum, event) => sum + event.checkedIn, 0);

  return {
    community: {
      followers: followers.length,
      following,
      newFollowers30d: followers.filter(follow => follow.createdAt >= thirtyDaysAgo).length,
      followerGrowth,
      recentFollowers: recentFollows.map(follow => ({
        id: follow.follower.id,
        name: userName(follow.follower),
        avatar: follow.follower.avatar || follow.follower.avatarUrl,
        followedAt: follow.createdAt,
        followsBack: recentFollowerSet.has(follow.follower.id),
      })),
      repeatAttendees: repeatAttendees.map(group => {
        const user = attendeeById.get(group.userId);
        return {
          id: group.userId,
          name: user ? userName(user) : 'Migo member',
          avatar: user?.avatar || user?.avatarUrl || null,
          eventsAttended: group._count._all,
        };
      }),
      followersAttending: attendingFollowerCount,
    },
    totals: {
      hosted: events.length,
      upcoming: dashboardEvents.filter(event => !event.isPast).length,
      past: pastEvents.length,
      registered,
      checkedIn,
      checkInRate: pastRegistered ? pastCheckedIn / pastRegistered : 0,
      capacity: events.reduce((sum, event) => sum + (event.capacity && event.capacity > 0 ? event.capacity : 0), 0),
      saves: dashboardEvents.reduce((sum, event) => sum + event.saves, 0),
      views: dashboardEvents.reduce((sum, event) => sum + event.views, 0),
    },
    events: dashboardEvents,
  };
}
