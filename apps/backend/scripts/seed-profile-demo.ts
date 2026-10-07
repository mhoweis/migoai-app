import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const REVIEW_PREFIX = 'profile-demo-review-';
const COMMENT_PREFIX = 'profile-demo-comment-';
const BOOKING_MARKER = '[seed:profile-demo]';
const TEST_USER_EMAIL = 'migo.test.20260921@example.com';

const friendEmails = [
  'sara.friend@migo.test',
  'omar.friend@migo.test',
  'layla.friend@migo.test',
  'yousef.friend@migo.test',
  'noor.friend@migo.test',
  'khalid.friend@migo.test',
  'maya.friend@migo.test',
  'adam.friend@migo.test',
];

const bioFor = (name: string) => `${name} is always looking for great events, good food and new places around Dubai.`;

async function profileAssets() {
  return prisma.event.findMany({
    where: { coverImage: { not: null } },
    select: { id: true, coverImage: true, startDate: true },
    orderBy: { startDate: 'asc' },
    take: 32,
  });
}

async function refreshEventRatings(eventIds: string[]) {
  for (const eventId of new Set(eventIds)) {
    const aggregate = await prisma.review.aggregate({
      where: { eventId },
      _avg: { overallRating: true },
      _count: { _all: true },
    });
    await prisma.event.update({
      where: { id: eventId },
      data: {
        ratingAverage: aggregate._avg.overallRating || 0,
        ratingCount: aggregate._count._all,
      },
    });
  }
}

async function removeSeedData() {
  const users = await prisma.user.findMany({
    where: { email: { in: [...friendEmails, TEST_USER_EMAIL] } },
    select: { id: true, bio: true, coverImage: true, preferences: true },
    orderBy: { email: 'asc' },
  });
  const comments = await prisma.reviewComment.deleteMany({
    where: { id: { startsWith: COMMENT_PREFIX } },
  });
  const reviewRows = await prisma.review.findMany({
    where: { id: { startsWith: REVIEW_PREFIX } },
    select: { eventId: true },
  });
  const reviews = await prisma.review.deleteMany({
    where: { id: { startsWith: REVIEW_PREFIX } },
  });
  const bookings = await prisma.booking.deleteMany({
    where: { notes: { startsWith: BOOKING_MARKER } },
  });
  for (const user of users) {
    const preferences = user.preferences && typeof user.preferences === 'object' && !Array.isArray(user.preferences)
      ? user.preferences as Record<string, any>
      : {};
    const marker = preferences.profileDemoSeed;
    if (!marker) continue;
    const data: { bio?: string | null; coverImage?: string | null; preferences?: any } = {};
    if (marker.bio && user.bio === marker.bio.value) data.bio = marker.bio.previous;
    if (marker.coverImage && user.coverImage === marker.coverImage.value) data.coverImage = marker.coverImage.previous;
    const { profileDemoSeed: _profileDemoSeed, ...rest } = preferences;
    data.preferences = Object.keys(rest).length ? rest : Prisma.DbNull;
    if (Object.keys(data).length) {
      await prisma.user.update({ where: { id: user.id }, data });
    }
  }
  await refreshEventRatings(reviewRows.map(review => review.eventId));
  return { comments: comments.count, reviews: reviews.count, bookings: bookings.count };
}

async function seedData() {
  const users = await prisma.user.findMany({
    where: { email: { in: [...friendEmails, TEST_USER_EMAIL] }, status: 'ACTIVE' },
    select: { id: true, email: true, name: true, bio: true, coverImage: true, preferences: true },
    orderBy: { email: 'asc' },
  });
  if (users.length !== friendEmails.length + 1) {
    throw new Error('Seed the eight sample friends and test account first.');
  }

  const now = new Date();
  const events = await prisma.event.findMany({
    where: {
      status: 'ACTIVE',
      startDate: { lt: now },
      OR: [{ endDate: null }, { endDate: { lt: now } }],
    },
    select: { id: true, title: true, startDate: true, endDate: true, coverImage: true },
    orderBy: { startDate: 'desc' },
    take: 100,
  });
  const covers = await profileAssets();
  if (events.length < 3 || !covers.length) throw new Error('At least three ended events and one cover image are required.');

  for (const [index, user] of users.entries()) {
    const expectedBio = bioFor(user.name || 'Migo member');
    const expectedCover = covers[index % covers.length].coverImage;
    const preferences = user.preferences && typeof user.preferences === 'object' && !Array.isArray(user.preferences)
      ? user.preferences as Record<string, any>
      : {};
    const existingMarker = preferences.profileDemoSeed;
    const marker = existingMarker && typeof existingMarker === 'object' && !Array.isArray(existingMarker)
      ? { ...existingMarker }
      : {};
    const data: { bio?: string; coverImage?: string; preferences?: Prisma.InputJsonValue } = {};
    if (!user.bio) {
      data.bio = expectedBio;
      marker.bio = { value: expectedBio, previous: user.bio };
    }
    if (!user.coverImage && expectedCover) {
      data.coverImage = expectedCover;
      marker.coverImage = { value: expectedCover, previous: user.coverImage };
    }
    if (Object.keys(marker).length) data.preferences = { ...preferences, profileDemoSeed: marker };
    if (Object.keys(data).length) await prisma.user.update({ where: { id: user.id }, data });
  }

  const reviewOwners: Array<{ userId: string; reviewId: string; eventId: string }> = [];
  for (const [userIndex, user] of users.entries()) {
    const targetCount = user.email === TEST_USER_EMAIL ? 2 : 1 + (userIndex % 3);
    const selected: typeof events = [];
    for (const event of events) {
      if (selected.length >= targetCount) break;
      const [booking, review] = await Promise.all([
        prisma.booking.findUnique({ where: { userId_eventId: { userId: user.id, eventId: event.id } }, select: { id: true } }),
        prisma.review.findUnique({ where: { userId_eventId: { userId: user.id, eventId: event.id } }, select: { id: true } }),
      ]);
      if (!booking && !review) selected.push(event);
    }
    if (selected.length < (user.email === TEST_USER_EMAIL ? 2 : 1)) {
      throw new Error(`Not enough available ended events for ${user.email}.`);
    }

    for (const event of selected) {
      const booking = await prisma.booking.upsert({
        where: { userId_eventId: { userId: user.id, eventId: event.id } },
        update: {
          status: 'CHECKED_IN',
          checkedInAt: event.endDate || event.startDate,
          attendeeName: user.name,
          attendeeEmail: user.email,
          notes: BOOKING_MARKER,
        },
        create: {
          userId: user.id,
          eventId: event.id,
          status: 'CHECKED_IN',
          ticketCount: 1,
          totalAmount: 0,
          currency: 'AED',
          checkedInAt: event.endDate || event.startDate,
          attendeeName: user.name,
          attendeeEmail: user.email,
          notes: BOOKING_MARKER,
        },
      });
      const reviewId = `${REVIEW_PREFIX}${user.id}-${event.id}`;
      const existingReview = await prisma.review.findUnique({
        where: { userId_eventId: { userId: user.id, eventId: event.id } },
        select: { id: true },
      });
      if (!existingReview) {
        await prisma.review.create({
          data: {
            id: reviewId,
            userId: user.id,
            eventId: event.id,
            overallRating: 4 + (userIndex % 2),
            title: 'A great Dubai experience',
            comment: `Really enjoyed ${event.title}. The atmosphere and organization made it a memorable day.`,
          },
        });
        reviewOwners.push({ userId: user.id, reviewId, eventId: event.id });
      } else if (existingReview.id.startsWith(REVIEW_PREFIX)) {
        reviewOwners.push({ userId: user.id, reviewId: existingReview.id, eventId: event.id });
      }
      if (!booking.notes?.startsWith(BOOKING_MARKER)) {
        await prisma.booking.update({ where: { id: booking.id }, data: { notes: BOOKING_MARKER } });
      }
    }
  }

  for (const review of reviewOwners) {
    const followers = await prisma.follow.findMany({
      where: { followingId: review.userId, follower: { email: { in: friendEmails } } },
      select: { followerId: true, follower: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 3,
    });
    for (const [index, follower] of followers.entries()) {
      if (index === 0) {
        await prisma.reviewLike.upsert({
          where: { reviewId_userId: { reviewId: review.reviewId, userId: follower.followerId } },
          create: { reviewId: review.reviewId, userId: follower.followerId },
          update: {},
        });
      }
      const commentId = `${COMMENT_PREFIX}${review.reviewId}-${follower.followerId}`;
      const commentText = `Thanks for sharing this, ${follower.follower.name?.split(' ')[0] || 'friend'} — it looks like a lovely event.`;
      await prisma.reviewComment.upsert({
        where: { id: commentId },
        create: { id: commentId, reviewId: review.reviewId, userId: follower.followerId, body: commentText },
        update: { body: commentText },
      });
    }
  }
  await refreshEventRatings(reviewOwners.map(review => review.eventId));

  const bookings = await prisma.booking.count({
    where: { userId: { in: users.map(user => user.id) }, notes: BOOKING_MARKER, status: 'CHECKED_IN' },
  });
  const reviews = await prisma.review.count({ where: { id: { startsWith: REVIEW_PREFIX } } });
  const interactions = await prisma.reviewComment.count({ where: { id: { startsWith: COMMENT_PREFIX } } });
  console.log(JSON.stringify({ users: users.length, checkedInBookings: bookings, reviews, comments: interactions }));
}

async function main() {
  const result = process.argv.includes('--remove') ? await removeSeedData() : await seedData();
  console.log(JSON.stringify(result));
}

main()
  .catch(error => {
    console.error('Profile demo seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
