// src/services/places/agent-places-tool.ts
//
// The `searchPlaces` capability, written as a proper tool so the week-7
// tool-calling rewrite can register it directly. Until then the agent calls
// `resolvePlacesForMessage` and the results are injected into the prompt as
// grounded context.
//
// The governing rule from the plan applies here exactly as it does to events:
// the model only ever sees rows that came out of the database. It cannot
// invent a venue, because it never gets to search anything itself.

import { findCachedPlaces, PlaceDto, searchPlaces } from './places.service';
import { geocode } from './geocode.service';
import logger from '../../utils/logger';

/** JSON-schema definition, ready to register with a tool-calling model. */
export const searchPlacesToolDefinition = {
  name: 'searchPlaces',
  description:
    'Find venues, restaurants, bars, galleries, gyms and other businesses in the UAE. ' +
    'Use this when the user asks where to go rather than what is on — for example ' +
    '"padel courts near Marina", "rooftop bars in Downtown", "art galleries in Al Quoz". ' +
    'For ticketed events use searchEvents instead.',
  parameters: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: 'What to look for, e.g. "specialty coffee", "padel court", "art gallery".',
      },
      city: {
        type: 'string',
        description:
          'Emirate or district, e.g. "Dubai Marina", "Abu Dhabi", "Al Quoz". ' +
          'Omit to use the user\'s current location.',
      },
      radiusKm: { type: 'number', description: 'Search radius in km (default 10, max 50).' },
      limit: { type: 'number', description: 'Maximum results to return (default 6, max 15).' },
    },
    required: ['keyword'],
  },
} as const;

export interface PlaceToolInput {
  keyword: string;
  city?: string;
  radiusKm?: number;
  limit?: number;
  /** The user's current position, when the app supplied one. */
  userLatitude?: number;
  userLongitude?: number;
  userId?: string;
}

export interface PlaceToolResult {
  places: PlaceDto[];
  /** True when nothing was cached and a background lookup has been queued. */
  queued: boolean;
  locationLabel: string | null;
  message: string;
}

/**
 * Executes the tool. Always returns immediately: it reads the cache, and
 * queues a background scrape only when the cache is thin, so a chat turn is
 * never held open waiting on Google.
 */
export async function executeSearchPlaces(input: PlaceToolInput): Promise<PlaceToolResult> {
  const limit = Math.min(input.limit ?? 6, 15);

  let latitude = input.userLatitude;
  let longitude = input.userLongitude;
  let locationLabel: string | null = null;

  if (input.city) {
    const resolved = await geocode(input.city);
    if (resolved) {
      latitude = resolved.latitude;
      longitude = resolved.longitude;
      locationLabel = resolved.label;
    }
  }

  const cached = await findCachedPlaces({
    keyword: input.keyword,
    latitude,
    longitude,
    radiusKm: input.radiusKm ?? 15,
    limit,
  });

  // Good enough to answer from cache.
  if (cached.length >= 3) {
    return {
      places: cached,
      queued: false,
      locationLabel,
      message: `${cached.length} place(s) found.`,
    };
  }

  // Thin cache: queue a real lookup for next time, return what we have now.
  if (latitude != null && longitude != null) {
    try {
      await searchPlaces({
        keyword: input.keyword,
        latitude,
        longitude,
        radiusMeters: (input.radiusKm ?? 10) * 1000,
        depth: 5,
        requestedBy: input.userId ?? null,
      });
    } catch (error) {
      logger.warn('places-tool: failed to queue background search', { error });
    }
  }

  return {
    places: cached,
    queued: true,
    locationLabel,
    message: cached.length
      ? `${cached.length} place(s) found so far; more are being fetched.`
      : 'Nothing cached yet — a lookup has been queued.',
  };
}

// ── Prompt-era bridge ────────────────────────────────────────────────────────
// The current agent returns JSON rather than calling tools, so we detect place
// intent ourselves and inject grounded rows. Delete this section once the
// tool-calling loop lands; `executeSearchPlaces` above stays as-is.

const PLACE_INTENT = [
  /\b(where can i|where should i|where to)\b/i,
  /\b(find|show|suggest|recommend)\s+(me\s+)?(a|some|any)?\s*(good\s+)?(place|places|spot|spots|venue|venues|restaurant|cafe|coffee|bar|bars|gym|gyms|court|courts|gallery|galleries|club|clubs|rooftop|beach|park)\b/i,
  /\b(best|good|nearby|near me|close by)\s+\w*\s*(place|spot|restaurant|cafe|coffee|bar|gym|court|gallery|brunch|rooftop)/i,
  /\b(padel|tennis|karting|bowling|climbing|yoga|pilates|brunch|shisha|rooftop)\b/i,
];

/** Cheap keyword detection — no model call, so it costs nothing. */
export function looksLikePlaceQuery(message: string): boolean {
  return PLACE_INTENT.some((pattern) => pattern.test(message));
}

/** Strips filler so the scraper gets a clean business-type keyword. */
export function extractPlaceKeyword(message: string): string {
  return (
    message
      .replace(
        /\b(where can i|where should i|where to|find|show|suggest|recommend|me|some|any|good|best|a|an|the|near|nearby|me|in|around|close by|go|get|please|can you|i want|looking for)\b/gi,
        ' '
      )
      .replace(/[?!.,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || message.slice(0, 80)
  );
}

/**
 * Called from the chat path. Returns null when the message is not about
 * places, so the normal event flow is untouched.
 */
export async function resolvePlacesForMessage(opts: {
  message: string;
  userId: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}): Promise<PlaceToolResult | null> {
  if (!looksLikePlaceQuery(opts.message)) return null;

  try {
    return await executeSearchPlaces({
      keyword: extractPlaceKeyword(opts.message),
      city: opts.city,
      userLatitude: opts.latitude,
      userLongitude: opts.longitude,
      userId: opts.userId,
      limit: 6,
    });
  } catch (error) {
    logger.warn('places-tool: resolve failed', { error });
    return null;
  }
}

/** Renders rows for the prompt, mirroring the E1/E2 event convention. */
export function formatPlacesForPrompt(result: PlaceToolResult): {
  block: string;
  placeIdMap: Record<string, string>;
} {
  const placeIdMap: Record<string, string> = {};

  if (!result.places.length) {
    return { block: 'No matching places in our directory yet.', placeIdMap };
  }

  const block = result.places
    .map((place, index) => {
      const ref = `P${index + 1}`;
      placeIdMap[ref] = place.id;
      const rating = place.rating ? `${place.rating}★ (${place.reviewCount ?? 0})` : 'unrated';
      const distance = place.distanceKm != null ? `${place.distanceKm}km` : '';
      return `${ref} | ${place.title} | ${place.category ?? 'venue'} | ${rating} | ${distance}`;
    })
    .join('\n');

  return { block, placeIdMap };
}
