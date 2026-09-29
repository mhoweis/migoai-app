import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'MigoFriend2026!';
const TEST_USER_EMAIL = 'migo.test.20260921@example.com';

const friendDefinitions = [
  { email: 'sara.friend@migo.test', name: 'Sara Al Mansoori', interests: ['Music', 'Arts & Culture', 'Food'] },
  { email: 'omar.friend@migo.test', name: 'Omar Haddad', interests: ['Sports', 'Technology', 'Business'] },
  { email: 'layla.friend@migo.test', name: 'Layla Khan', interests: ['Wellness', 'Family', 'Arts & Culture'] },
  { email: 'yousef.friend@migo.test', name: 'Yousef Rahman', interests: ['Music', 'Nightlife', 'Comedy'] },
  { email: 'noor.friend@migo.test', name: 'Noor Abdulla', interests: ['Exhibition', 'Conference', 'Technology'] },
  { email: 'khalid.friend@migo.test', name: 'Khalid Saeed', interests: ['Sports', 'Family', 'Food'] },
  { email: 'maya.friend@migo.test', name: 'Maya Fernandes', interests: ['Arts & Culture', 'Theatre', 'Music'] },
  { email: 'adam.friend@migo.test', name: 'Adam Mikhail', interests: ['Technology', 'Business', 'Nightlife'] },
] as const;

const interestPatterns: Record<string, string[]> = {
  'Arts & Culture': ['arts', 'culture', 'gallery', 'theatre', 'theater'],
  Business: ['business', 'finance', 'corporate', 'advertising'],
  Comedy: ['comedy'],
  Conference: ['conference', 'conferences', 'association'],
  Exhibition: ['exhibition', 'exhibitions', 'expo'],
  Family: ['family', 'youth'],
  Food: ['food', 'catering', 'hotel'],
  Music: ['music', 'concert', 'live shows'],
  Nightlife: ['nightlife', 'entertainment'],
  Sports: ['sport', 'running', 'fitness', 'multi-sport'],
  Technology: ['technology', 'it'],
  Theatre: ['theatre', 'theater', 'live shows'],
  Wellness: ['wellness', 'health', 'fitness'],
};

const categoryMatches = (category: string, interest: string): boolean => {
  const normalizedCategory = category.toLowerCase();
  return (interestPatterns[interest] || [interest.toLowerCase()])
    .some(pattern => normalizedCategory.includes(pattern));
};

async function main() {
  const password = await bcrypt.hash(PASSWORD, 10);
  const now = new Date();
  const upcomingEvents = await prisma.event.findMany({
    where: {
      status: 'ACTIVE',
      visibility: 'PUBLIC',
      startDate: { gte: now },
      city: { in: ['Dubai', 'Abu Dhabi'] },
    },
    select: {
      id: true,
      category: true,
      startDate: true,
      city: true,
      coverImage: true,
    },
    orderBy: { startDate: 'asc' },
    take: 500,
  });
  const sharedEvents = upcomingEvents
    .filter(event => event.city === 'Dubai' && event.coverImage)
    .slice(0, 2);

  if (sharedEvents.length < 2) {
    throw new Error('Expected at least two upcoming Dubai events with cover images');
  }

  const users = [];
  for (const definition of friendDefinitions) {
    const avatar = `https://i.pravatar.cc/150?u=${encodeURIComponent(definition.email)}`;
    const user = await prisma.user.upsert({
      where: { email: definition.email },
      update: {
        name: definition.name,
        password,
        avatar,
        avatarUrl: avatar,
        emailVerified: true,
        isVerified: false,
        interests: [...definition.interests],
        preferences: { interests: [...definition.interests] },
      },
      create: {
        email: definition.email,
        name: definition.name,
        password,
        avatar,
        avatarUrl: avatar,
        emailVerified: true,
        isVerified: false,
        interests: [...definition.interests],
        preferences: { interests: [...definition.interests] },
      },
    });
    users.push({ ...definition, user });
  }

  for (const [friendIndex, friend] of users.entries()) {
    const matching = upcomingEvents.filter(event =>
      friend.interests.some(interest => categoryMatches(event.category, interest))
    );
    const extraCount = 3 + (friendIndex % 3 === 0 ? 1 : 0);
    const extras = Array.from({ length: matching.length }, (_, offset) =>
      matching[(friendIndex * 2 + offset) % matching.length]
    ).filter((event, index, events) => (
      !sharedEvents.some(shared => shared.id === event.id)
      && events.findIndex(candidate => candidate.id === event.id) === index
    )).slice(0, extraCount);
    const selectedEvents = [...sharedEvents, ...extras];

    for (const event of selectedEvents) {
      await prisma.booking.upsert({
        where: { userId_eventId: { userId: friend.user.id, eventId: event.id } },
        update: {
          status: 'CONFIRMED',
          ticketCount: 1,
          totalAmount: 0,
          currency: 'AED',
          attendeeName: friend.name,
          attendeeEmail: friend.email,
          qrCode: null,
        },
        create: {
          userId: friend.user.id,
          eventId: event.id,
          status: 'CONFIRMED',
          ticketCount: 1,
          totalAmount: 0,
          currency: 'AED',
          attendeeName: friend.name,
          attendeeEmail: friend.email,
          qrCode: null,
        },
      });
    }
  }

  const testUser = await prisma.user.findUnique({
    where: { email: TEST_USER_EMAIL },
    select: { id: true },
  });
  if (testUser) {
    for (const email of ['sara.friend@migo.test', 'omar.friend@migo.test', 'layla.friend@migo.test']) {
      const friend = users.find(item => item.email === email);
      if (friend) {
        await prisma.follow.upsert({
          where: { followerId_followingId: { followerId: friend.user.id, followingId: testUser.id } },
          update: {},
          create: { followerId: friend.user.id, followingId: testUser.id },
        });
      }
    }
  }

  for (const [index, friend] of users.entries()) {
    const next = users[(index + 1) % users.length];
    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId: friend.user.id, followingId: next.user.id } },
      update: {},
      create: { followerId: friend.user.id, followingId: next.user.id },
    });
  }

  const bookingCount = await prisma.booking.count({
    where: { userId: { in: users.map(item => item.user.id) }, status: 'CONFIRMED' },
  });
  const followCount = await prisma.follow.count({
    where: {
      OR: [
        { followerId: { in: users.map(item => item.user.id) } },
        { followingId: { in: users.map(item => item.user.id) } },
      ],
    },
  });
  console.log(JSON.stringify({
    users: users.length,
    sharedEvents: sharedEvents.length,
    bookings: bookingCount,
    follows: followCount,
  }));
}

main()
  .catch(error => {
    console.error('Sample friends seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
