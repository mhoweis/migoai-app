import { Prisma } from '@prisma/client';
import { Event } from '@migo/shared';
import prisma from '../database/prisma';
import { eventService, notEndedWhere } from './events.service';
import logger from '../utils/logger';

export type SignalType = 'search' | 'view' | 'save' | 'unsave' | 'book' | 'attend' | 'click_out';

export const SIGNAL_WEIGHTS: Record<SignalType, number> = {
  search: 1,
  view: 0.5,
  save: 2,
  unsave: -2,
  book: 3,
  attend: 4,
  click_out: 1.5,
};

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'you', 'are',
  'near', 'all', 'any', 'what', 'where', 'when', 'how', 'find', 'show',
  'events', 'event', 'in', 'on', 'at', 'to', 'of', 'a', 'an',
]);

const tokenize = (value: unknown): string[] => (
  typeof value === 'string'
    ? value
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map(token => token.trim())
      .filter(token => token.length >= 3 && !STOPWORDS.has(token))
    : []
);

const addWeight = (map: Map<string, number>, key: unknown, weight: number) => {
  if (typeof key !== 'string' || !key.trim()) return;
  const normalized = key.trim().toLowerCase();
  map.set(normalized, (map.get(normalized) || 0) + weight);
};

const addTokens = (map: Map<string, number>, value: unknown, weight: number) => {
  tokenize(value).forEach(token => addWeight(map, token, weight));
};

const signalContext = (value: Prisma.JsonValue | null): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

export async function recordSignal(
  userId: string,
  type: SignalType,
  opts: { eventId?: string; context?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    let context: Record<string, unknown> = { ...(opts.context || {}) };
    if (opts.eventId) {
      const event = await prisma.event.findFirst({
        where: {
          OR: [
            { id: opts.eventId },
            { migoId: opts.eventId },
            { slug: opts.eventId },
          ],
        },
        select: { category: true, tags: true, venueName: true, organizerId: true, title: true },
      });
      if (event) {
        context = {
          ...context,
          category: event.category,
          tags: event.tags,
          venueName: event.venueName,
          organizerId: event.organizerId,
          title: event.title,
        };
      }
    }
    await prisma.userSignal.create({
      data: {
        userId,
        eventId: opts.eventId,
        type,
        weight: SIGNAL_WEIGHTS[type],
        context: context as Prisma.InputJsonObject,
      },
    });
  } catch (error) {
    logger.warn('recommendation: failed to record signal', { userId, type, eventId: opts.eventId, error });
  }
}

export interface TasteProfile {
  terms: Map<string, number>;
  venues: Map<string, number>;
  organizers: Map<string, number>;
}

export async function buildProfile(userId: string): Promise<TasteProfile> {
  const [user, signals] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { interests: true, preferences: true } }),
    prisma.userSignal.findMany({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const profile: TasteProfile = {
    terms: new Map(),
    venues: new Map(),
    organizers: new Map(),
  };
  const userInterests = Array.isArray(user?.interests) ? user.interests : [];
  const preferences = user?.preferences && typeof user.preferences === 'object' && !Array.isArray(user.preferences)
    ? user.preferences as Record<string, unknown>
    : {};
  const preferenceInterests = Array.isArray(preferences.interests) ? preferences.interests : [];
  [...userInterests, ...preferenceInterests].forEach(interest => addTokens(profile.terms, interest, 1.5));

  signals.forEach(signal => {
    const ageDays = (Date.now() - signal.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    const effective = signal.weight * (0.5 ** (ageDays / 30));
    const context = signalContext(signal.context);
    if (signal.type === 'search') {
      addTokens(profile.terms, context.query, effective);
      return;
    }
    addTokens(profile.terms, context.category, effective * 2);
    const tags = Array.isArray(context.tags) ? context.tags : [];
    tags.forEach(tag => addTokens(profile.terms, tag, effective));
    addTokens(profile.terms, context.title, effective);
    addWeight(profile.venues, context.venueName, effective);
    addWeight(profile.organizers, context.organizerId, effective);
  });
  return profile;
}

const eventTokens = (event: any): { terms: string[]; category: string[] } => ({
  category: tokenize(event.category),
  terms: [
    ...tokenize(event.title),
    ...(Array.isArray(event.tags) ? event.tags.flatMap((tag: unknown) => tokenize(tag)) : []),
  ],
});

export async function recommendEvents(
  userId: string,
  opts: { city: string; from: Date; to: Date; limit: number },
): Promise<Event[]> {
  const [profile, candidates] = await Promise.all([
    buildProfile(userId),
    prisma.event.findMany({
      where: {
        status: 'ACTIVE',
        visibility: { in: ['PUBLIC', 'UNLISTED'] },
        city: { equals: opts.city, mode: 'insensitive' },
        startDate: { gte: opts.from, lte: opts.to },
        AND: [notEndedWhere()],
        bookings: {
          none: {
            userId,
            status: { not: 'CANCELLED' },
          },
        },
      },
      take: 300,
      orderBy: { startDate: 'asc' },
      select: eventService.getEventSelectFields(userId),
    }),
  ]) as [TasteProfile, any[]];
  const hasProfile = profile.terms.size > 0 || profile.venues.size > 0 || profile.organizers.size > 0;
  if (!hasProfile) {
    return candidates
      .slice(0, opts.limit)
      .map(event => eventService.formatEventResponse(event, userId));
  }
  const now = Date.now();
  return candidates
    .map(event => {
      const { terms, category } = eventTokens(event);
      let score = 0;
      category.forEach(token => { score += (profile.terms.get(token) || 0) * 2; });
      terms.forEach(token => { score += profile.terms.get(token) || 0; });
      score += (profile.venues.get((event.venueName || '').trim().toLowerCase()) || 0) * 1.5;
      score += (profile.organizers.get(event.organizerId || '') || 0) * 2;
      score += 0.01 * Math.log1p(event.clickCount || 0);
      score -= 0.05 * Math.max(0, (new Date(event.startDate).getTime() - now) / (24 * 60 * 60 * 1000));
      return { event, score };
    })
    .sort((a, b) => b.score - a.score || new Date(a.event.startDate).getTime() - new Date(b.event.startDate).getTime())
    .slice(0, opts.limit)
    .map(({ event }) => eventService.formatEventResponse(event, userId));
}
