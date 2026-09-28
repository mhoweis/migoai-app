// src/services/places/places.service.ts
//
// Cache-first place search.
//
// A scrape job takes 30 seconds to 10 minutes, and Google rate-limits by IP,
// so the user-facing path NEVER scrapes inline. It:
//
//   1. serves matching places straight from the `places` table when a recent
//      identical search exists, and
//   2. otherwise enqueues one shared job and tells the client to poll.
//
// Because the cache key is the normalized query (not the user), a hundred
// people asking for "brunch in Dubai Marina" produce exactly one scrape job.

import prisma from '../../config/database';
import logger from '../../utils/logger';
import { ScrapedPlace } from './gmaps-client';

/** How long a completed search stays fresh. Venue data moves slowly. */
const CACHE_TTL_HOURS = Number(process.env.PLACES_CACHE_TTL_HOURS ?? 24 * 14);
/** Coordinates are rounded to this many decimals when building the cache key. */
const KEY_PRECISION = 2; // ~1.1 km — close enough to share a job

export interface PlaceSearchParams {
  keyword: string;
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  depth?: number;
  requestedBy?: string | null;
}

export interface PlaceDto {
  id: string;
  title: string;
  category: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  mapsUrl: string | null;
  thumbnail: string | null;
  rating: number | null;
  reviewCount: number | null;
  instagram: string | null;
  distanceKm?: number | null;
}

export type SearchStatus = 'ready' | 'pending' | 'failed';

export interface PlaceSearchResult {
  status: SearchStatus;
  searchId: string;
  places: PlaceDto[];
  /** Populated when status is 'pending' — seconds to wait before polling. */
  retryAfterSeconds?: number;
  message?: string;
  cachedAt?: Date | null;
}

export function buildQueryKey(params: PlaceSearchParams): string {
  const keyword = params.keyword.trim().toLowerCase().replace(/\s+/g, ' ');
  const lat = params.latitude.toFixed(KEY_PRECISION);
  const lon = params.longitude.toFixed(KEY_PRECISION);
  const depth = params.depth ?? 5;
  const radius = params.radiusMeters ?? 10_000;
  return `${keyword}|${lat},${lon}|r${radius}|d${depth}`.slice(0, 400);
}

/** Great-circle distance in km. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function toDto(place: any, origin?: { lat: number; lon: number }): PlaceDto {
  const distanceKm =
    origin && place.latitude != null && place.longitude != null
      ? Number(haversineKm(origin.lat, origin.lon, place.latitude, place.longitude).toFixed(2))
      : null;

  return {
    id: place.id,
    title: place.title,
    category: place.category,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    phone: place.phone,
    website: place.website,
    mapsUrl: place.mapsUrl,
    thumbnail: place.thumbnail,
    rating: place.rating,
    reviewCount: place.reviewCount,
    instagram: place.instagram,
    distanceKm,
  };
}

async function loadHits(searchId: string, origin: { lat: number; lon: number }): Promise<PlaceDto[]> {
  const hits = await prisma.placeSearchHit.findMany({
    where: { searchId, place: { isHidden: false } },
    orderBy: { rank: 'asc' },
    include: { place: true },
  });
  return hits.map((hit: any) => toDto(hit.place, origin));
}

/**
 * The single entry point used by the HTTP route and the agent tool.
 * Never blocks on the scraper.
 */
export async function searchPlaces(params: PlaceSearchParams): Promise<PlaceSearchResult> {
  const queryKey = buildQueryKey(params);
  const origin = { lat: params.latitude, lon: params.longitude };
  const now = new Date();

  const existing = await prisma.placeSearch.findUnique({ where: { queryKey } });

  if (existing) {
    const fresh = existing.expiresAt ? existing.expiresAt > now : false;

    if (existing.status === 'ok' && fresh) {
      return {
        status: 'ready',
        searchId: existing.id,
        places: await loadHits(existing.id, origin),
        cachedAt: existing.completedAt,
      };
    }

    if (existing.status === 'pending' || existing.status === 'running') {
      return {
        status: 'pending',
        searchId: existing.id,
        places: [],
        retryAfterSeconds: 15,
        message: 'Looking this up now — results usually land within a minute.',
      };
    }

    // Stale or failed: reset it and let the worker try again.
    await prisma.placeSearch.update({
      where: { id: existing.id },
      data: {
        status: 'pending',
        error: null,
        jobId: null,
        startedAt: null,
        completedAt: null,
        requestedBy: params.requestedBy ?? existing.requestedBy,
      },
    });

    return {
      status: 'pending',
      searchId: existing.id,
      // Serve the stale results while the refresh runs — better than nothing.
      places: existing.status === 'ok' ? await loadHits(existing.id, origin) : [],
      retryAfterSeconds: 15,
      message: 'Refreshing these results.',
    };
  }

  const created = await prisma.placeSearch.create({
    data: {
      queryKey,
      keyword: params.keyword.trim().slice(0, 300),
      latitude: params.latitude,
      longitude: params.longitude,
      radiusMeters: params.radiusMeters ?? 10_000,
      depth: params.depth ?? 5,
      requestedBy: params.requestedBy ?? null,
      status: 'pending',
    },
  });

  return {
    status: 'pending',
    searchId: created.id,
    places: [],
    retryAfterSeconds: 20,
    message: 'Looking this up now — results usually land within a minute.',
  };
}

/** Poll endpoint: read a search by ID. */
export async function getSearch(
  searchId: string,
  origin?: { lat: number; lon: number }
): Promise<PlaceSearchResult | null> {
  const search = await prisma.placeSearch.findUnique({ where: { id: searchId } });
  if (!search) return null;

  const where = origin ?? { lat: search.latitude, lon: search.longitude };

  if (search.status === 'ok') {
    return {
      status: 'ready',
      searchId: search.id,
      places: await loadHits(search.id, where),
      cachedAt: search.completedAt,
    };
  }

  if (search.status === 'failed') {
    return {
      status: 'failed',
      searchId: search.id,
      places: [],
      message:
        search.error ??
        'That lookup did not come back. It usually means we are being rate-limited — try again shortly.',
    };
  }

  return {
    status: 'pending',
    searchId: search.id,
    places: [],
    retryAfterSeconds: 15,
    message: 'Still looking.',
  };
}

/** Upserts scraped rows and records their ranking against the search. */
export async function persistResults(searchId: string, scraped: ScrapedPlace[]): Promise<number> {
  let rank = 0;
  let stored = 0;

  for (const row of scraped) {
    try {
      const place = await prisma.place.upsert({
        where: { externalId: row.externalId },
        create: {
          externalId: row.externalId,
          title: row.title,
          category: row.category,
          address: row.address,
          latitude: row.latitude,
          longitude: row.longitude,
          phone: row.phone,
          website: row.website,
          mapsUrl: row.mapsUrl,
          thumbnail: row.thumbnail,
          priceRange: row.priceRange,
          rating: row.rating,
          reviewCount: row.reviewCount ?? 0,
        },
        update: {
          title: row.title,
          category: row.category,
          address: row.address,
          latitude: row.latitude,
          longitude: row.longitude,
          phone: row.phone,
          website: row.website,
          mapsUrl: row.mapsUrl,
          thumbnail: row.thumbnail,
          priceRange: row.priceRange,
          rating: row.rating,
          reviewCount: row.reviewCount ?? 0,
          lastSeenAt: new Date(),
        },
      });

      await prisma.placeSearchHit.upsert({
        where: { searchId_placeId: { searchId, placeId: place.id } },
        create: { searchId, placeId: place.id, rank: rank++ },
        update: { rank: rank++ },
      });

      stored++;
    } catch (error) {
      logger.warn('places: failed to persist row', { title: row.title, error });
    }
  }

  return stored;
}

/** Marks a search complete. */
export async function completeSearch(searchId: string, resultCount: number): Promise<void> {
  await prisma.placeSearch.update({
    where: { id: searchId },
    data: {
      status: 'ok',
      resultCount,
      completedAt: new Date(),
      expiresAt: new Date(Date.now() + CACHE_TTL_HOURS * 3600 * 1000),
      error: null,
    },
  });
}

export async function failSearch(searchId: string, message: string): Promise<void> {
  await prisma.placeSearch.update({
    where: { id: searchId },
    data: { status: 'failed', error: message.slice(0, 1000), completedAt: new Date() },
  });
}

/**
 * Local-only lookup, used by the agent tool. Returns whatever is already
 * cached without ever enqueueing a job, so a chat turn is never blocked.
 */
export async function findCachedPlaces(opts: {
  keyword?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  limit?: number;
}): Promise<PlaceDto[]> {
  const limit = Math.min(opts.limit ?? 10, 25);
  const terms = (opts.keyword ?? '').trim();

  const places = await prisma.place.findMany({
    where: {
      isHidden: false,
      ...(opts.city ? { city: { contains: opts.city, mode: 'insensitive' } } : {}),
      ...(terms
        ? {
            OR: [
              { title: { contains: terms, mode: 'insensitive' } },
              { category: { contains: terms, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
    take: limit * 4,
  });

  const origin =
    opts.latitude != null && opts.longitude != null
      ? { lat: opts.latitude, lon: opts.longitude }
      : undefined;

  let dtos = places.map((place: any) => toDto(place, origin));

  if (origin && opts.radiusKm) {
    dtos = dtos.filter(
      (p: PlaceDto) => p.distanceKm != null && p.distanceKm <= opts.radiusKm!
    );
  }
  if (origin) {
    dtos.sort((a: PlaceDto, b: PlaceDto) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  }

  return dtos.slice(0, limit);
}
