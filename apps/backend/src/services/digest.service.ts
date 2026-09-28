import config from '../config/env';
import prisma from '../config/database';
import { getSourceInfo, SourceInfo } from './providers/source-registry';

export interface WeekendDigestEvent {
  id: string;
  title: string;
  startDate: Date;
  venueName: string | null;
  city: string | null;
  coverImage: string | null;
  isFree: boolean;
  priceFrom: number | null;
  currency: string;
  source: string;
  url: string;
}

export interface WeekendDigest {
  title: string;
  rangeStart: Date;
  rangeEnd: Date;
  city?: string;
  sections: Array<{ heading: string; events: WeekendDigestEvent[] }>;
}

const cache = new Map<string, { expiresAt: number; value: WeekendDigest }>();
const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;
const webBase = (config.APP_PUBLIC_URL || 'http://localhost:8081').replace(/\/+$/, '');

function weekendRange(now = new Date()): { start: Date; end: Date } {
  const localNow = new Date(now.getTime() + DUBAI_OFFSET_MS);
  const day = localNow.getUTCDay();
  const daysUntilFriday = (5 - day + 7) % 7;
  const friday = new Date(Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate() + daysUntilFriday,
  ));
  if (day >= 5) {
    friday.setUTCDate(localNow.getUTCDate());
  }
  const sundayEnd = new Date(friday);
  sundayEnd.setUTCDate(friday.getUTCDate() + 2);
  sundayEnd.setUTCHours(23, 59, 59, 999);
  return {
    start: new Date(friday.getTime() - DUBAI_OFFSET_MS),
    end: new Date(sundayEnd.getTime() - DUBAI_OFFSET_MS),
  };
}

function eventSource(event: any): SourceInfo {
  return getSourceInfo(event.externalSource, event.source);
}

function makeDigestEvent(event: any): WeekendDigestEvent {
  const source = eventSource(event);
  return {
    id: event.id,
    title: event.title,
    startDate: event.startDate,
    venueName: event.venueName,
    city: event.city,
    coverImage: event.coverImage,
    isFree: event.isFree,
    priceFrom: event.priceFrom == null ? null : Number(event.priceFrom),
    currency: event.currency,
    source: source.label,
    url: `${webBase}/e/${encodeURIComponent(event.id)}`,
  };
}

function matchesCategory(event: any, patterns: string[]): boolean {
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const value = `${event.category || ''} ${tags.join(' ')}`.toLowerCase();
  return patterns.some(pattern => value.includes(pattern));
}

export async function buildWeekendDigest(city?: string, locale: 'en' | 'ar' = 'en'): Promise<WeekendDigest> {
  const normalizedCity = city?.trim() || undefined;
  const key = `${normalizedCity || '*'}:${locale}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const { start, end } = weekendRange();
  const events = await prisma.event.findMany({
    where: {
      status: 'ACTIVE',
      visibility: 'PUBLIC',
      startDate: { gte: start, lte: end },
      ...(normalizedCity ? { city: { equals: normalizedCity, mode: 'insensitive' } } : {}),
    },
    orderBy: { startDate: 'asc' },
    take: 300,
    select: {
      id: true,
      title: true,
      startDate: true,
      venueName: true,
      city: true,
      coverImage: true,
      isFree: true,
      priceFrom: true,
      currency: true,
      externalSource: true,
      source: true,
      category: true,
      tags: true,
    },
  });
  const used = new Set<string>();
  const selectSection = (
    heading: string,
    predicate: (event: any) => boolean,
    limit: number,
  ) => {
    const selected = events.filter(event => !used.has(event.id) && predicate(event)).slice(0, limit);
    selected.forEach(event => used.add(event.id));
    return { heading, events: selected.map(makeDigestEvent) };
  };
  const sections = [
    selectSection(locale === 'ar' ? 'مجانية في عطلة نهاية الأسبوع' : 'Free this weekend', event => event.isFree, 8),
    selectSection(locale === 'ar' ? 'اختيارات رسمية' : 'Official picks', event => ['official', 'venue'].includes(eventSource(event).kind), 8),
    selectSection(locale === 'ar' ? 'حفلات وعروض' : 'Concerts & shows', event => matchesCategory(event, ['music', 'concert', 'theatre', 'show']), 6),
    selectSection(locale === 'ar' ? 'العائلة' : 'Family', event => matchesCategory(event, ['family', 'kids', 'workshop']), 6),
    selectSection(locale === 'ar' ? 'كل الفعاليات الأخرى' : 'Everything else', () => true, 10),
  ].filter(section => section.events.length > 0);
  const digest: WeekendDigest = {
    title: locale === 'ar'
      ? `فعاليات ${normalizedCity || 'الإمارات'} في عطلة نهاية الأسبوع`
      : `What's on in ${normalizedCity || 'the UAE'} this weekend`,
    rangeStart: start,
    rangeEnd: end,
    ...(normalizedCity ? { city: normalizedCity } : {}),
    sections,
  };
  cache.set(key, { expiresAt: Date.now() + 15 * 60 * 1000, value: digest });
  return digest;
}

export function clearDigestCache(): void {
  cache.clear();
}

export function formatDigestTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export default { buildWeekendDigest, clearDigestCache };
