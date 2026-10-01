import { BookingStatus, CampaignStatus, Prisma } from '@prisma/client';
import prisma from '../database/prisma';
import sourceRegistry, { SourceInfo } from './providers/source-registry';
import { getSupplierPackage, supplierPackages } from './supplier-packages';

export interface SupplierDateRange {
  from: Date;
  to: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const bookingStatuses = [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN];
const sourceInfos = Object.values(sourceRegistry).filter(source => source.kind !== 'demo');

export function parseSupplierDateRange(
  input: { from?: string; to?: string },
  now = new Date(),
): SupplierDateRange {
  const to = input.to ? new Date(input.to) : now;
  const from = input.from ? new Date(input.from) : new Date(now.getTime() - 29 * DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new Error('Invalid analytics date range');
  }
  return { from, to };
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function rangeDates(range: SupplierDateRange): string[] {
  const date = new Date(range.from);
  date.setUTCHours(0, 0, 0, 0);
  const last = new Date(range.to);
  last.setUTCHours(0, 0, 0, 0);
  const days: string[] = [];
  while (date <= last) {
    days.push(dateKey(date));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return days;
}

function increment(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) || 0) + amount);
}

function classifyClickPlatform(platform: string | null, userAgent: string | null): 'app' | 'website' | 'mobile_web' {
  if (platform === 'app' || platform === 'website' || platform === 'mobile_web') return platform;
  if (/Expo|okhttp|CFNetwork|Dalvik/i.test(userAgent || '')) return 'app';
  if (/Mobile|Android|iPhone/i.test(userAgent || '')) return 'mobile_web';
  return 'website';
}

function getUniqueClickerKey(click: { userId: string | null; ipHash: string | null }): string | null {
  if (click.userId) return `user:${click.userId}`;
  if (click.ipHash) return `ip:${click.ipHash}`;
  return null;
}

function normalizeQuery(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function signalQuery(context: Prisma.JsonValue | null): string {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return '';
  return normalizeQuery((context as Prisma.JsonObject).query);
}

async function ensureSuppliers() {
  return Promise.all(sourceInfos.map(source => prisma.supplier.upsert({
    where: { sourceKey: source.id },
    update: {},
    create: {
      sourceKey: source.id,
      name: source.label,
      website: source.url || null,
    },
  })));
}

async function loadSupplierAnalytics(range: SupplierDateRange) {
  const suppliers = await ensureSuppliers();
  const sourceKeys = suppliers.map(supplier => supplier.sourceKey);
  const events = await prisma.event.findMany({
    where: { externalSource: { in: sourceKeys } },
    select: {
      id: true,
      externalSource: true,
      title: true,
      startDate: true,
      status: true,
      category: true,
      city: true,
    },
  });
  const eventIds = events.map(event => event.id);
  const supplierIds = suppliers.map(supplier => supplier.id);
  const createdAt = { gte: range.from, lte: range.to };
  const [clicks, impressions, views, saves, bookings, campaigns] = await Promise.all([
    prisma.affiliateClick.findMany({
      where: { eventId: { in: eventIds }, createdAt },
      select: {
        eventId: true,
        userId: true,
        ipHash: true,
        platform: true,
        userAgent: true,
        placement: true,
        createdAt: true,
      },
    }),
    prisma.eventView.findMany({
      where: { eventId: { in: eventIds }, viewedAt: createdAt },
      select: { eventId: true, userId: true, viewedAt: true },
    }),
    prisma.userSignal.findMany({
      where: { eventId: { in: eventIds }, type: 'view', createdAt },
      select: { eventId: true, userId: true, createdAt: true },
    }),
    prisma.wishlist.findMany({
      where: { eventId: { in: eventIds }, createdAt },
      select: { eventId: true, createdAt: true },
    }),
    prisma.booking.findMany({
      where: {
        eventId: { in: eventIds },
        bookingDate: createdAt,
        status: { in: bookingStatuses },
      },
      select: { eventId: true, ticketCount: true, totalAmount: true, bookingDate: true },
    }),
    prisma.supplierCampaign.findMany({
      where: {
        supplierId: { in: supplierIds },
        status: CampaignStatus.ACTIVE,
        endsAt: { gt: new Date() },
      },
      select: { supplierId: true, priceAed: true },
    }),
  ]);

  const eventsBySource = new Map<string, typeof events>();
  for (const event of events) {
    if (!event.externalSource) continue;
    const grouped = eventsBySource.get(event.externalSource) || [];
    grouped.push(event);
    eventsBySource.set(event.externalSource, grouped);
  }
  const metricsBySource = new Map<string, {
    eventsListed: number;
    upcomingEvents: number;
    impressions: number;
    views: number;
    clicks: number;
    uniqueClickers: number;
    saves: number;
    bookings: number;
    tickets: number;
    revenue: number;
    ctr: number;
    activeCampaigns: number;
  }>();
  const now = new Date();

  for (const supplier of suppliers) {
    const sourceEvents = eventsBySource.get(supplier.sourceKey) || [];
    const sourceEventIds = new Set(sourceEvents.map(event => event.id));
    const sourceClicks = clicks.filter(row => sourceEventIds.has(row.eventId));
    const sourceImpressions = impressions.filter(row => sourceEventIds.has(row.eventId));
    const sourceViews = views.filter(row => row.eventId && sourceEventIds.has(row.eventId));
    const sourceSaves = saves.filter(row => sourceEventIds.has(row.eventId));
    const sourceBookings = bookings.filter(row => sourceEventIds.has(row.eventId));
    const uniqueClickers = new Set(sourceClicks.map(getUniqueClickerKey).filter((key): key is string => key !== null));
    const clickCount = sourceClicks.length;
    const viewCount = sourceViews.length;
    const activeCampaignCount = campaigns.filter(campaign => campaign.supplierId === supplier.id).length;
    metricsBySource.set(supplier.sourceKey, {
      eventsListed: sourceEvents.filter(event => event.status !== 'DELETED').length,
      upcomingEvents: sourceEvents.filter(event => event.status !== 'DELETED' && event.startDate >= now).length,
      impressions: sourceImpressions.length,
      views: viewCount,
      clicks: clickCount,
      uniqueClickers: uniqueClickers.size,
      saves: sourceSaves.length,
      bookings: sourceBookings.length,
      tickets: sourceBookings.reduce((total, booking) => total + booking.ticketCount, 0),
      revenue: sourceBookings.reduce((total, booking) => total + Number(booking.totalAmount || 0), 0),
      ctr: sourceImpressions.length ? clickCount / sourceImpressions.length : 0,
      activeCampaigns: activeCampaignCount,
    });
  }

  const sourceInfoByKey = new Map<string, SourceInfo>(sourceInfos.map(source => [source.id, source] as const));
  const rows = suppliers.map(supplier => {
    const sourceInfo = sourceInfoByKey.get(supplier.sourceKey);
    const sourceDetails = sourceInfo ? {
      label: sourceInfo.label,
      labelAr: sourceInfo.labelAr,
      kind: sourceInfo.kind,
      url: sourceInfo.url,
    } : {
      label: supplier.name,
      labelAr: supplier.name,
      kind: 'community',
      url: supplier.website || '',
    };
    return {
      ...supplier,
      ...sourceDetails,
      ...(metricsBySource.get(supplier.sourceKey) || {
      eventsListed: 0,
      upcomingEvents: 0,
      impressions: 0,
      views: 0,
      clicks: 0,
      uniqueClickers: 0,
      saves: 0,
      bookings: 0,
      tickets: 0,
      revenue: 0,
      ctr: 0,
      activeCampaigns: 0,
      }),
    };
  }).sort((left, right) => right.clicks - left.clicks);

  return {
    rows,
    events,
    clicks,
    impressions,
    views,
    saves,
    bookings,
    campaigns,
  };
}

function buildDailyClicks(
  range: SupplierDateRange,
  clicks: Array<{ createdAt: Date; platform: string | null; userAgent: string | null }>,
  bookings: Array<{ bookingDate: Date }>,
) {
  type DailyClickRow = {
    date: string;
    clicks: number;
    app: number;
    website: number;
    mobile_web: number;
    bookings: number;
  };
  const days = rangeDates(range);
  const daily = new Map<string, DailyClickRow>(days.map(date => [date, {
    date,
    clicks: 0,
    app: 0,
    website: 0,
    mobile_web: 0,
    bookings: 0,
  }] as [string, DailyClickRow]));
  for (const click of clicks) {
    const row = daily.get(dateKey(click.createdAt));
    if (!row) continue;
    const platform = classifyClickPlatform(click.platform, click.userAgent);
    row.clicks += 1;
    row[platform] += 1;
  }
  for (const booking of bookings) {
    const row = daily.get(dateKey(booking.bookingDate));
    if (row) row.bookings += 1;
  }
  return days.map(date => daily.get(date)!);
}

async function getSupplierSearchTerms(
  range: SupplierDateRange,
  sourceEventIds: Set<string>,
  clicks: Array<{ eventId: string; userId: string | null; createdAt: Date }>,
  views: Array<{ eventId: string | null; userId: string; createdAt: Date }>,
) {
  const firstEngagement = new Map<string, Date>();
  for (const engagement of [
    ...clicks.filter(row => sourceEventIds.has(row.eventId)),
    ...views.filter(row => row.eventId && sourceEventIds.has(row.eventId)),
  ]) {
    if (!engagement.userId) continue;
    const current = firstEngagement.get(engagement.userId);
    if (!current || engagement.createdAt < current) firstEngagement.set(engagement.userId, engagement.createdAt);
  }
  const userIds = [...firstEngagement.keys()];
  if (!userIds.length) return [];

  const createdAt = { gte: range.from, lte: range.to };
  const [signals, logs] = await Promise.all([
    prisma.userSignal.findMany({
      where: { userId: { in: userIds }, type: 'search', createdAt },
      select: { userId: true, context: true, createdAt: true },
    }),
    prisma.searchLog.findMany({
      where: { userId: { in: userIds }, createdAt },
      select: { userId: true, query: true, createdAt: true },
    }),
  ]);
  const counts = new Map<string, { count: number; users: Set<string> }>();
  const addQuery = (userId: string, query: string, created: Date) => {
    const normalized = normalizeQuery(query);
    const engagedAt = firstEngagement.get(userId);
    if (!normalized || !engagedAt || created > engagedAt) return;
    const current = counts.get(normalized) || { count: 0, users: new Set<string>() };
    current.count += 1;
    current.users.add(userId);
    counts.set(normalized, current);
  };
  signals.forEach(signal => addQuery(signal.userId, signalQuery(signal.context), signal.createdAt));
  logs.forEach(log => addQuery(log.userId!, log.query, log.createdAt));
  return [...counts.entries()]
    .map(([query, value]) => ({ query, count: value.count, uniqueUsers: value.users.size }))
    .sort((left, right) => right.count - left.count || left.query.localeCompare(right.query))
    .slice(0, 10);
}

export async function getSupplierList(range: SupplierDateRange) {
  const { rows } = await loadSupplierAnalytics(range);
  return rows;
}

export async function getSupplierDetail(supplierId: string, range: SupplierDateRange) {
  const data = await loadSupplierAnalytics(range);
  const supplier = data.rows.find(row => row.id === supplierId);
  if (!supplier) return null;

  const eventRows = data.events.filter(event => event.externalSource === supplier.sourceKey);
  const eventIds = new Set(eventRows.map(event => event.id));
  const clicks = data.clicks.filter(row => eventIds.has(row.eventId));
  const bookings = data.bookings.filter(row => eventIds.has(row.eventId));
  const views = data.views.filter(row => row.eventId && eventIds.has(row.eventId));
  const saves = data.saves.filter(row => eventIds.has(row.eventId));
  const daily = buildDailyClicks(range, clicks, bookings);
  const clicksByPlatform = { app: 0, website: 0, mobile_web: 0 };
  const clicksByPlacement = new Map<string, number>();
  for (const click of clicks) {
    clicksByPlatform[classifyClickPlatform(click.platform, click.userAgent)] += 1;
    increment(clicksByPlacement, click.placement || 'unknown');
  }

  const clicksByEvent = new Map<string, number>();
  const viewsByEvent = new Map<string, number>();
  const savesByEvent = new Map<string, number>();
  const bookingsByEvent = new Map<string, number>();
  const ticketsByEvent = new Map<string, number>();
  clicks.forEach(row => increment(clicksByEvent, row.eventId));
  views.forEach(row => row.eventId && increment(viewsByEvent, row.eventId));
  saves.forEach(row => increment(savesByEvent, row.eventId));
  bookings.forEach(row => {
    increment(bookingsByEvent, row.eventId);
    increment(ticketsByEvent, row.eventId, row.ticketCount);
  });
  const topEvents = eventRows.map(event => ({
    id: event.id,
    title: event.title,
    startDate: event.startDate,
    views: viewsByEvent.get(event.id) || 0,
    clicks: clicksByEvent.get(event.id) || 0,
    saves: savesByEvent.get(event.id) || 0,
    bookings: bookingsByEvent.get(event.id) || 0,
    tickets: ticketsByEvent.get(event.id) || 0,
  })).sort((left, right) => right.clicks - left.clicks || left.title.localeCompare(right.title))
    .slice(0, 20);

  const topSearchTerms = await getSupplierSearchTerms(range, eventIds, clicks, data.views);
  return {
    ...supplier,
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    clicksByDay: daily,
    clicksByPlatform,
    clicksByPlacement: [...clicksByPlacement.entries()]
      .map(([placement, count]) => ({ placement, clicks: count }))
      .sort((left, right) => right.clicks - left.clicks),
    topEvents,
    topSearchTerms,
    upcomingEventOptions: eventRows
      .filter(event => event.status === 'ACTIVE' && event.startDate >= new Date())
      .sort((left, right) => left.startDate.getTime() - right.startDate.getTime())
      .map(({ id, title, startDate }) => ({ id, title, startDate })),
  };
}

interface SearchEntry {
  query: string;
  userId: string | null;
  createdAt: Date;
}

async function getSearchEntries(from: Date, to: Date): Promise<{ entries: SearchEntry[]; logs: Array<{
  query: string;
  userId: string | null;
  createdAt: Date;
  resultsCount: number;
}> }> {
  const createdAt = { gte: from, lte: to };
  const [signals, logs] = await Promise.all([
    prisma.userSignal.findMany({
      where: { type: 'search', createdAt },
      select: { userId: true, context: true, createdAt: true },
    }),
    prisma.searchLog.findMany({
      where: { createdAt },
      select: { userId: true, query: true, resultsCount: true, createdAt: true },
    }),
  ]);
  const entries: SearchEntry[] = [
    ...signals.map(signal => ({
      query: signalQuery(signal.context),
      userId: signal.userId,
      createdAt: signal.createdAt,
    })),
    ...logs.map(log => ({
      query: normalizeQuery(log.query),
      userId: log.userId,
      createdAt: log.createdAt,
    })),
  ].filter(entry => Boolean(entry.query));
  return {
    entries,
    logs: logs.map(log => ({ ...log, query: normalizeQuery(log.query) })).filter(log => Boolean(log.query)),
  };
}

async function getInterestCategories(range: SupplierDateRange) {
  const events = await prisma.event.findMany({
    where: { status: { not: 'DELETED' } },
    select: { id: true, category: true },
  });
  const eventIds = events.map(event => event.id);
  const createdAt = { gte: range.from, lte: range.to };
  const [views, saves, clicks, bookings] = await Promise.all([
    prisma.eventView.findMany({
      where: { eventId: { in: eventIds }, viewedAt: createdAt },
      select: { eventId: true },
    }),
    prisma.wishlist.findMany({
      where: { eventId: { in: eventIds }, createdAt },
      select: { eventId: true },
    }),
    prisma.affiliateClick.findMany({
      where: { eventId: { in: eventIds }, createdAt },
      select: { eventId: true },
    }),
    prisma.booking.findMany({
      where: { eventId: { in: eventIds }, bookingDate: createdAt, status: { in: bookingStatuses } },
      select: { eventId: true },
    }),
  ]);
  const categoryByEvent = new Map(events.map(event => [event.id, event.category] as const));
  const counts = new Map<string, { views: number; saves: number; clicks: number; bookings: number }>();
  const add = (eventId: string, field: 'views' | 'saves' | 'clicks' | 'bookings') => {
    const category = categoryByEvent.get(eventId);
    if (!category) return;
    const current = counts.get(category) || { views: 0, saves: 0, clicks: 0, bookings: 0 };
    current[field] += 1;
    counts.set(category, current);
  };
  views.forEach(row => add(row.eventId, 'views'));
  saves.forEach(row => add(row.eventId, 'saves'));
  clicks.forEach(row => add(row.eventId, 'clicks'));
  bookings.forEach(row => add(row.eventId, 'bookings'));
  return [...counts.entries()]
    .map(([category, value]) => ({ category, ...value, score: value.views + value.saves + value.clicks + value.bookings }))
    .sort((left, right) => right.score - left.score || left.category.localeCompare(right.category))
    .slice(0, 20);
}

function interestTags(value: Prisma.JsonValue | null): string[] {
  if (Array.isArray(value)) return value.filter((tag): tag is string => typeof tag === 'string');
  if (typeof value === 'string') return value.split(',').map(tag => tag.trim()).filter(Boolean);
  return [];
}

export async function getSearchInsights(range: SupplierDateRange) {
  const now = new Date();
  const currentStart = new Date(now.getTime() - 7 * DAY_MS);
  const previousStart = new Date(now.getTime() - 14 * DAY_MS);
  const queryStart = range.from < previousStart ? range.from : previousStart;
  const { entries, logs } = await getSearchEntries(queryStart, range.to);
  const currentEntries = entries.filter(entry => entry.createdAt >= range.from && entry.createdAt <= range.to);
  const topCounts = new Map<string, { count: number; users: Set<string> }>();
  for (const entry of currentEntries) {
    const current = topCounts.get(entry.query) || { count: 0, users: new Set<string>() };
    current.count += 1;
    if (entry.userId) current.users.add(entry.userId);
    topCounts.set(entry.query, current);
  }
  const topQueries = [...topCounts.entries()]
    .map(([query, value]) => ({ query, count: value.count, uniqueUsers: value.users.size }))
    .sort((left, right) => right.count - left.count || left.query.localeCompare(right.query))
    .slice(0, 30);

  const currentCounts = new Map<string, number>();
  const previousCounts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.createdAt >= currentStart) increment(currentCounts, entry.query);
    else if (entry.createdAt >= previousStart) increment(previousCounts, entry.query);
  }
  const trending = [...currentCounts.entries()]
    .map(([query, count]) => {
      const previousCount = previousCounts.get(query) || 0;
      return {
        query,
        count,
        previousCount,
        growthPercent: previousCount ? Math.round(((count - previousCount) / previousCount) * 100) : 100,
      };
    })
    .filter(query => query.count > query.previousCount)
    .sort((left, right) => right.growthPercent - left.growthPercent || right.count - left.count)
    .slice(0, 15);

  const zeroResults = new Map<string, { count: number; users: Set<string> }>();
  for (const log of logs.filter(row => row.createdAt >= range.from && row.createdAt <= range.to && row.resultsCount === 0)) {
    const current = zeroResults.get(log.query) || { count: 0, users: new Set<string>() };
    current.count += 1;
    if (log.userId) current.users.add(log.userId);
    zeroResults.set(log.query, current);
  }
  const zeroResultQueries = [...zeroResults.entries()]
    .map(([query, value]) => ({ query, count: value.count, uniqueUsers: value.users.size }))
    .sort((left, right) => right.count - left.count || left.query.localeCompare(right.query))
    .slice(0, 30);

  const [interestCategories, users, eventViews] = await Promise.all([
    getInterestCategories(range),
    prisma.user.findMany({ select: { interests: true } }),
    prisma.eventView.findMany({
      where: { viewedAt: { gte: range.from, lte: range.to } },
      select: { event: { select: { city: true } } },
    }),
  ]);
  const interestCounts = new Map<string, { label: string; count: number }>();
  for (const user of users) {
    const seen = new Set<string>();
    for (const tag of interestTags(user.interests)) {
      const normalized = tag.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      const current = interestCounts.get(normalized) || { label: tag.trim(), count: 0 };
      current.count += 1;
      interestCounts.set(normalized, current);
    }
  }
  const popularInterests = [...interestCounts.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 30)
    .map(({ label, count }) => ({ interest: label, count }));
  const emirateCounts = new Map<string, number>();
  for (const row of eventViews) {
    const city = row.event.city?.trim();
    if (city) increment(emirateCounts, city);
  }
  const byEmirate = [...emirateCounts.entries()]
    .map(([emirate, views]) => ({ emirate, views }))
    .sort((left, right) => right.views - left.views || left.emirate.localeCompare(right.emirate));

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    topQueries,
    trending,
    zeroResultQueries,
    interestCategories,
    popularInterests,
    byEmirate,
  };
}

export async function getSupplierOverview(range: SupplierDateRange) {
  const data = await loadSupplierAnalytics(range);
  const activeCampaigns = await prisma.supplierCampaign.findMany({
    where: {
      supplierId: { in: data.rows.map(row => row.id) },
      status: CampaignStatus.ACTIVE,
      endsAt: { gt: new Date() },
    },
    select: { priceAed: true },
  });
  const uniqueClickers = new Set(data.clicks.map(getUniqueClickerKey).filter((key): key is string => key !== null));
  const totals = data.rows.reduce((result, supplier) => ({
    clicks: result.clicks + supplier.clicks,
    bookings: result.bookings + supplier.bookings,
    tickets: result.tickets + supplier.tickets,
    revenue: result.revenue + supplier.revenue,
    impressions: result.impressions + supplier.impressions,
    views: result.views + supplier.views,
  }), { clicks: 0, bookings: 0, tickets: 0, revenue: 0, impressions: 0, views: 0 });
  const clicksByDay = buildDailyClicks(range, data.clicks, data.bookings);
  const searchInsights = await getSearchInsights(range);
  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    totals: {
      ...totals,
      uniqueClickers: uniqueClickers.size,
      activeCampaigns: activeCampaigns.length,
      activeCampaignRevenue: activeCampaigns.reduce((sum, campaign) => sum + Number(campaign.priceAed), 0),
    },
    clicksByDay,
    topSuppliers: data.rows.slice(0, 5),
    topSearches: searchInsights.topQueries.slice(0, 5),
  };
}

export async function updateSupplier(
  supplierId: string,
  input: Prisma.SupplierUpdateInput,
) {
  return prisma.supplier.update({ where: { id: supplierId }, data: input });
}

export async function getSupplierCampaigns(supplierId: string) {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true } });
  if (!supplier) return null;
  return prisma.supplierCampaign.findMany({
    where: { supplierId },
    orderBy: [{ createdAt: 'desc' }],
  });
}

export async function createSupplierCampaign(input: {
  supplierId: string;
  packageKey: string;
  eventId?: string;
  startsAt: Date;
  endsAt: Date;
  priceAed?: number;
  notes?: string | null;
}) {
  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new Error('Supplier not found');
  const supplierPackage = getSupplierPackage(input.packageKey);
  if (!supplierPackage) throw new Error('Unknown campaign package');
  if (input.endsAt <= input.startsAt) throw new Error('Campaign end must be after start');
  if (input.eventId) {
    const event = await prisma.event.findFirst({
      where: { id: input.eventId, externalSource: supplier.sourceKey },
      select: { id: true },
    });
    if (!event) throw new Error('Event does not belong to this supplier');
  }
  return prisma.supplierCampaign.create({
    data: {
      supplierId: supplier.id,
      packageKey: supplierPackage.key,
      eventId: input.eventId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      priceAed: input.priceAed ?? supplierPackage.priceAed,
      notes: input.notes,
      status: CampaignStatus.PROPOSED,
    },
  });
}

function csvCell(value: unknown): string {
  const text = value instanceof Date ? value.toISOString() : value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRows(rows: unknown[][]): string {
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function supplierReportCsv(detail: NonNullable<Awaited<ReturnType<typeof getSupplierDetail>>>): string {
  const rows: unknown[][] = [
    ['metric', 'value'],
    ['supplier', detail.name],
    ['sourceKey', detail.sourceKey],
    ['from', detail.range.from],
    ['to', detail.range.to],
    ['eventsListed', detail.eventsListed],
    ['upcomingEvents', detail.upcomingEvents],
    ['impressions', detail.impressions],
    ['views', detail.views],
    ['clicks', detail.clicks],
    ['uniqueClickers', detail.uniqueClickers],
    ['saves', detail.saves],
    ['bookings', detail.bookings],
    ['tickets', detail.tickets],
    ['revenue', detail.revenue],
    ['ctr', detail.ctr],
    ['activeCampaigns', detail.activeCampaigns],
    [],
    ['date', 'clicks', 'app', 'website', 'mobile_web', 'bookings'],
    ...detail.clicksByDay.map(day => [day.date, day.clicks, day.app, day.website, day.mobile_web, day.bookings]),
    [],
    ['event_id', 'title', 'start_date', 'views', 'clicks', 'saves', 'bookings', 'tickets'],
    ...detail.topEvents.map(event => [
      event.id,
      event.title,
      event.startDate,
      event.views,
      event.clicks,
      event.saves,
      event.bookings,
      event.tickets,
    ]),
  ];
  return csvRows(rows);
}

export function searchInsightsCsv(insights: Awaited<ReturnType<typeof getSearchInsights>>): string {
  return csvRows([
    ['topQueries'],
    ['query', 'count', 'uniqueUsers'],
    ...insights.topQueries.map(row => [row.query, row.count, row.uniqueUsers]),
    [],
    ['trending'],
    ['query', 'count', 'previousCount', 'growthPercent'],
    ...insights.trending.map(row => [row.query, row.count, row.previousCount, row.growthPercent]),
    [],
    ['zeroResultQueries'],
    ['query', 'count', 'uniqueUsers'],
    ...insights.zeroResultQueries.map(row => [row.query, row.count, row.uniqueUsers]),
    [],
    ['interestCategories'],
    ['category', 'score', 'views', 'saves', 'clicks', 'bookings'],
    ...insights.interestCategories.map(row => [
      row.category,
      row.score,
      row.views,
      row.saves,
      row.clicks,
      row.bookings,
    ]),
    [],
    ['popularInterests'],
    ['interest', 'count'],
    ...insights.popularInterests.map(row => [row.interest, row.count]),
    [],
    ['byEmirate'],
    ['emirate', 'views'],
    ...insights.byEmirate.map(row => [row.emirate, row.views]),
  ]);
}

export { supplierPackages };
