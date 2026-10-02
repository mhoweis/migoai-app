import 'dotenv/config';
import bcrypt from 'bcryptjs';
import {
  PlanKey,
  Prisma,
  PrismaClient,
  SubscriptionStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';

const prisma = new PrismaClient();
const PASSWORD = 'MigoRoles2026!';
const SEEDED_USERS = [
  { email: 'migo.free@example.com', name: 'Migo Free', role: UserRole.USER, status: UserStatus.ACTIVE },
  { email: 'migo.host@example.com', name: 'Migo Host', role: UserRole.ORGANIZER, status: UserStatus.ACTIVE },
  { email: 'migo.supplier@example.com', name: 'Migo Supplier', role: UserRole.SUPPLIER, status: UserStatus.ACTIVE },
  { email: 'migo.paused@example.com', name: 'Migo Paused', role: UserRole.USER, status: UserStatus.PAUSED },
] as const;

const SUBSCRIPTIONS = [
  { email: 'migo.host@example.com', plan: PlanKey.HOST, amountAed: 99, reference: 'seed-account-types-host' },
  { email: 'migo.supplier@example.com', plan: PlanKey.SUPPLIER, amountAed: 499, reference: 'seed-account-types-supplier' },
] as const;

async function removeFixtures() {
  const emails = SEEDED_USERS.map(user => user.email);
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const userIds = users.map(user => user.id);
  const subscriptions = await prisma.subscription.deleteMany({
    where: {
      OR: [
        { reference: { in: SUBSCRIPTIONS.map(subscription => subscription.reference) } },
        ...(userIds.length ? [{ userId: { in: userIds } }] : []),
      ],
    },
  });
  if (userIds.length) {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.deviceToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.organizerProfile.deleteMany({ where: { userId: { in: userIds } } });
  }
  const removedUsers = await prisma.user.deleteMany({ where: { email: { in: emails } } });
  console.log(`Removed ${removedUsers.count} seeded accounts and ${subscriptions.count} subscriptions.`);
}

async function seedFixtures() {
  const supplier = await prisma.supplier.findUnique({ where: { sourceKey: 'visit-dubai' } });
  if (!supplier) throw new Error('The existing visit-dubai supplier is required before seeding accounts.');

  await prisma.supplier.update({
    where: { id: supplier.id },
    data: {
      description: supplier.description || 'Discover official Visit Dubai events, experiences and destination highlights.',
      slug: supplier.slug || 'visit-dubai',
    },
  });

  const password = await bcrypt.hash(PASSWORD, 10);
  const users = new Map<string, string>();
  for (const fixture of SEEDED_USERS) {
    const user = await prisma.user.upsert({
      where: { email: fixture.email },
      update: {
        name: fixture.name,
        password,
        role: fixture.role,
        status: fixture.status,
        pausedAt: fixture.status === UserStatus.PAUSED ? new Date() : null,
        pausedReason: fixture.status === UserStatus.PAUSED ? 'Test pause' : null,
        supplierId: fixture.role === UserRole.SUPPLIER ? supplier.id : null,
        isOrganizer: fixture.role === UserRole.ORGANIZER || fixture.role === UserRole.SUPPLIER,
        isAdmin: false,
        preferences: { locale: 'en' } satisfies Prisma.InputJsonObject,
      },
      create: {
        email: fixture.email,
        name: fixture.name,
        password,
        role: fixture.role,
        status: fixture.status,
        pausedAt: fixture.status === UserStatus.PAUSED ? new Date() : null,
        pausedReason: fixture.status === UserStatus.PAUSED ? 'Test pause' : null,
        supplierId: fixture.role === UserRole.SUPPLIER ? supplier.id : null,
        isOrganizer: fixture.role === UserRole.ORGANIZER || fixture.role === UserRole.SUPPLIER,
        isAdmin: false,
        preferences: { locale: 'en' } satisfies Prisma.InputJsonObject,
      },
      select: { id: true, email: true },
    });
    users.set(user.email!, user.id);
  }

  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  for (const fixture of SUBSCRIPTIONS) {
    const userId = users.get(fixture.email);
    if (!userId) throw new Error(`Missing seeded user ${fixture.email}`);
    await prisma.subscription.upsert({
      where: { reference: fixture.reference },
      update: {
        userId,
        plan: fixture.plan,
        status: SubscriptionStatus.ACTIVE,
        amountAed: fixture.amountAed,
        provider: 'seed',
        currentPeriodEnd: periodEnd,
        cancelledAt: null,
      },
      create: {
        userId,
        plan: fixture.plan,
        status: SubscriptionStatus.ACTIVE,
        amountAed: fixture.amountAed,
        provider: 'seed',
        reference: fixture.reference,
        currentPeriodEnd: periodEnd,
      },
    });
  }

  console.log(`Seeded ${SEEDED_USERS.length} accounts and ${SUBSCRIPTIONS.length} active subscriptions.`);
  console.log(`Supplier fixture: ${supplier.name} (${supplier.id}, ${supplier.slug || 'visit-dubai'}).`);
  console.log(`Shared password: ${PASSWORD}`);
}

async function main() {
  if (process.argv.includes('--remove')) await removeFixtures();
  else await seedFixtures();
}

main()
  .catch(error => {
    console.error('Account-type seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
