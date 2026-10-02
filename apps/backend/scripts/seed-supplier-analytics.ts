import { randomUUID } from 'crypto';
import { CampaignStatus, Prisma } from '@prisma/client';
import prisma from '../src/database/prisma';
import sources, { providerSuppliers } from '../src/services/providers/source-registry';
import { setSupplierCampaignStatus } from '../src/services/supplier-campaigns.service';

const CLICK_PREFIX = 'seed-supplier-analytics-';
const IMPRESSION_SOURCE = 'supplier_analytics_seed';
const SIGNAL_MARKER = 'supplier-analytics';
const CAMPAIGN_MARKER = '[seed:supplier-analytics]';
const SEARCH_TERMS = [
  'brunch',
  'f1',
  'comedy',
  'kids',
  'gitex',
  'concert',
  'yoga',
  'desert safari',
  'basketball',
  'art',
];
const PLACEMENTS = ['home', 'search', 'event_detail', 'weekend_digest', 'ai_feed'];
const PLATFORMS = [
  { platform: 'app', userAgent: 'Expo/54.0 (Android 15)' },
  { platform: 'website', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36' },
  { platform: 'mobile_web', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148' },
];

const randomItem = <T>(values: T[]): T => values[Math.floor(Math.random() * values.length)];
const randomDate = (now: Date): Date => new Date(now.getTime() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000));
const seededContext = (extra: Record<string, unknown> = {}): Prisma.InputJsonObject => ({
  ...extra,
  seed: true,
  seedSource: SIGNAL_MARKER,
});

async function removeSeedData() {
  const clicks = await prisma.affiliateClick.deleteMany({
    where: { token: { startsWith: CLICK_PREFIX } },
  });
  const impressions = await prisma.eventView.deleteMany({
    where: { source: IMPRESSION_SOURCE },
  });
  const signals = await prisma.userSignal.findMany({
    where: { type: { in: ['view', 'search'] } },
    select: { id: true, context: true },
  });
  const signalIds = signals
    .filter(signal => signal.context && typeof signal.context === 'object' && !Array.isArray(signal.context))
    .filter(signal => (signal.context as Prisma.JsonObject).seed === true
      && (signal.context as Prisma.JsonObject).seedSource === SIGNAL_MARKER)
    .map(signal => signal.id);
  const removedSignals = signalIds.length
    ? await prisma.userSignal.deleteMany({ where: { id: { in: signalIds } } })
    : { count: 0 };

  const campaigns = await prisma.supplierCampaign.findMany({
    where: { notes: { startsWith: CAMPAIGN_MARKER } },
    select: { id: true, status: true },
  });
  for (const campaign of campaigns) {
    if (campaign.status === CampaignStatus.ACTIVE) {
      await setSupplierCampaignStatus(campaign.id, CampaignStatus.CANCELLED);
    }
  }
  const removedCampaigns = campaigns.length
    ? await prisma.supplierCampaign.deleteMany({ where: { id: { in: campaigns.map(campaign => campaign.id) } } })
    : { count: 0 };

  return {
    clicks: clicks.count,
    impressions: impressions.count,
    signals: removedSignals.count,
    campaigns: removedCampaigns.count,
  };
}

async function seedData() {
  const now = new Date();
  const registry = Object.values(sources).filter(source => source.kind !== 'demo');
  const suppliers = await Promise.all(registry.map(source => {
    const supplierSpec = providerSuppliers[source.id];
    return prisma.supplier.upsert({
      where: { sourceKey: source.id },
      update: {},
      create: {
        sourceKey: source.id,
        name: source.label,
        website: supplierSpec?.website || source.url || null,
        ...(supplierSpec ? { slug: supplierSpec.slug, status: 'ACTIVE' as const } : {}),
      },
    });
  }));
  const events = await prisma.event.findMany({
    where: {
      externalSource: { in: registry.map(source => source.id) },
      startDate: { gte: now },
      status: { not: 'DELETED' },
    },
    select: {
      id: true,
      externalSource: true,
      externalUrl: true,
      ticketUrl: true,
    },
  });
  if (!events.length) throw new Error('No upcoming source events are available to seed');

  const sourceCounts = new Map<string, number>();
  events.forEach(event => event.externalSource && sourceCounts.set(
    event.externalSource,
    (sourceCounts.get(event.externalSource) || 0) + 1,
  ));
  const topSourceKeys = [...sourceCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([sourceKey]) => sourceKey);
  const eligibleEvents = events.filter(event => event.externalSource && topSourceKeys.includes(event.externalSource));
  const friends = await prisma.user.findMany({
    where: { email: { endsWith: '.friend@migo.test' } },
    select: { id: true },
  });
  if (!friends.length) throw new Error('No sample-friend users are available');
  const friendIds = friends.map(friend => friend.id);

  const clicks = Array.from({ length: 400 }, (_, index) => {
    const event = randomItem(eligibleEvents);
    const platform = randomItem(PLATFORMS);
    const isAnonymous = index < 240;
    return {
      token: `${CLICK_PREFIX}${randomUUID()}`,
      userId: isAnonymous ? null : randomItem(friendIds),
      eventId: event.id,
      supplier: event.externalSource || 'unknown',
      platform: platform.platform,
      targetUrl: event.externalUrl || event.ticketUrl || 'https://example.com',
      placement: randomItem(PLACEMENTS),
      ipHash: isAnonymous ? `seed-${(index % 150) + 1}` : null,
      userAgent: platform.userAgent,
      createdAt: randomDate(now),
    };
  });
  await prisma.affiliateClick.createMany({ data: clicks });

  const clicksByEvent = new Map<string, number>();
  clicks.forEach(click => clicksByEvent.set(click.eventId, (clicksByEvent.get(click.eventId) || 0) + 1));
  const signalViews: Array<{
    userId: string;
    eventId: string;
    type: string;
    weight: number;
    context: Prisma.InputJsonObject;
    createdAt: Date;
  }> = [];
  const impressions: Array<{
    eventId: string;
    userId: string;
    source: string;
    viewedAt: Date;
  }> = [];
  for (const event of eligibleEvents) {
    const eventClicks = clicksByEvent.get(event.id) || 0;
    if (!eventClicks) continue;
    const viewCount = eventClicks * (6 + Math.floor(Math.random() * 5));
    const impressionCount = viewCount * (3 + Math.floor(Math.random() * 3));
    for (let index = 0; index < viewCount; index += 1) {
      signalViews.push({
        userId: randomItem(friendIds),
        eventId: event.id,
        type: 'view',
        weight: 0.5,
        context: seededContext() as Prisma.InputJsonObject,
        createdAt: randomDate(now),
      });
    }
    for (let index = 0; index < impressionCount; index += 1) {
      impressions.push({
        eventId: event.id,
        userId: randomItem(friendIds),
        source: IMPRESSION_SOURCE,
        viewedAt: randomDate(now),
      });
    }
  }
  await prisma.eventView.createMany({ data: impressions });
  const searchSignals = Array.from({ length: 60 }, () => ({
    userId: randomItem(friendIds),
    type: 'search',
    weight: 1,
    context: seededContext({ query: randomItem(SEARCH_TERMS) }),
    createdAt: randomDate(now),
  }));
  await prisma.userSignal.createMany({ data: [...signalViews, ...searchSignals] });

  const visitDubai = suppliers.find(supplier => supplier.sourceKey === 'visit-dubai');
  const visitDubaiEvent = events.find(event => event.externalSource === 'visit-dubai');
  if (!visitDubai || !visitDubaiEvent) throw new Error('Visit Dubai upcoming event is required for the featured campaign seed');
  const activeCampaign = await prisma.supplierCampaign.create({
    data: {
      supplierId: visitDubai.id,
      packageKey: 'featured_home',
      eventId: visitDubaiEvent.id,
      startsAt: new Date(now.getTime() - DAY_MS),
      endsAt: new Date(now.getTime() + 7 * DAY_MS),
      priceAed: 1500,
      status: CampaignStatus.PROPOSED,
      notes: `${CAMPAIGN_MARKER} active featured_home`,
    },
  });
  await setSupplierCampaignStatus(activeCampaign.id, CampaignStatus.ACTIVE);

  await prisma.supplierCampaign.create({
    data: {
      supplierId: visitDubai.id,
      packageKey: 'weekend_digest',
      startsAt: now,
      endsAt: new Date(now.getTime() + 7 * DAY_MS),
      priceAed: 700,
      status: CampaignStatus.PROPOSED,
      notes: `${CAMPAIGN_MARKER} proposed weekend_digest`,
    },
  });
  return {
    topSourceKeys,
    upcomingEvents: eligibleEvents.length,
    clicks: clicks.length,
    views: signalViews.length,
    impressions: impressions.length,
    searches: searchSignals.length,
    campaigns: 2,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  if (process.argv.includes('--remove')) {
    console.log(JSON.stringify({ removed: await removeSeedData() }, null, 2));
    return;
  }

  const removed = await removeSeedData();
  const seeded = await seedData();
  console.log(JSON.stringify({ removedBeforeSeed: removed, seeded }, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
