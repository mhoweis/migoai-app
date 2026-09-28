// src/routes/places.routes.ts
//
// User-facing place discovery.
//
//   POST /api/places/search       → start or read a search (never blocks)
//   GET  /api/places/search/:id   → poll a pending search
//   GET  /api/places/nearby       → cached places near a coordinate (instant)
//   GET  /api/places/:id          → one place
//
// Every route requires authentication. Searches are rate-limited per user
// because a cache miss enqueues a real scrape job, and abusing that gets the
// server's IP rate-limited by Google.

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';
import {
  searchPlaces,
  getSearch,
  findCachedPlaces,
  haversineKm,
} from '../services/places/places.service';
import { geocode, nearestKnownPlace } from '../services/places/geocode.service';
import logger from '../utils/logger';

const router = Router();

// ── Per-user search limiting ─────────────────────────────────────────────────
// Deliberately stricter than the AI burst limit: a miss costs a scrape job.

const SEARCH_WINDOW_MS = Number(process.env.PLACES_SEARCH_WINDOW_MS ?? 60 * 60_000);
const SEARCH_MAX = Number(process.env.PLACES_SEARCH_MAX_PER_HOUR ?? 20);

const buckets = new Map<string, { count: number; resetAt: number }>();

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, SEARCH_WINDOW_MS);
if (typeof (sweeper as any)?.unref === 'function') (sweeper as any).unref();

const searchLimit = (req: AuthRequest, res: Response, next: NextFunction) => {
  const key = req.userId || `ip:${req.ip}`;
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + SEARCH_WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  res.setHeader('X-RateLimit-Limit', String(SEARCH_MAX));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, SEARCH_MAX - bucket.count)));

  if (bucket.count > SEARCH_MAX) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      success: false,
      error: 'Too many searches',
      message: `You've hit the search limit for this hour. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
    });
  }

  next();
};

router.use(authenticate);

// ── Schemas ──────────────────────────────────────────────────────────────────

const searchSchema = z
  .object({
    keyword: z.string().min(2).max(120),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    city: z.string().min(2).max(100).optional(),
    radiusKm: z.number().min(1).max(50).optional(),
    // Depth is capped hard: higher values raise block risk sharply, and this
    // is a user-triggered path.
    depth: z.number().int().min(1).max(10).optional(),
  })
  .refine(
    (v: { latitude?: number; longitude?: number; city?: string }) =>
      (v.latitude != null && v.longitude != null) || Boolean(v.city),
    {
      message: 'Provide either coordinates or a city',
    }
  );

// ── Routes ───────────────────────────────────────────────────────────────────

/** Start (or read) a place search. Returns immediately, never blocks. */
router.post('/search', searchLimit, async (req: AuthRequest, res: Response) => {
  const parsed = searchSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: parsed.error.issues[0]?.message ?? 'Invalid search',
    });
  }

  const input = parsed.data;

  try {
    let latitude = input.latitude;
    let longitude = input.longitude;
    let locationLabel: string | null = null;

    if (latitude == null || longitude == null) {
      const resolved = await geocode(input.city!);
      if (!resolved) {
        return res.status(422).json({
          success: false,
          error: 'Unknown location',
          message: `I could not find "${input.city}". Try an emirate or a district name.`,
        });
      }
      latitude = resolved.latitude;
      longitude = resolved.longitude;
      locationLabel = resolved.label;
    } else {
      locationLabel = nearestKnownPlace(latitude, longitude);
    }

    const result = await searchPlaces({
      keyword: input.keyword,
      latitude,
      longitude,
      radiusMeters: (input.radiusKm ?? 10) * 1000,
      depth: input.depth ?? 5,
      requestedBy: req.userId ?? null,
    });

    res.json({
      success: true,
      data: { ...result, locationLabel, latitude, longitude },
    });
  } catch (error: any) {
    logger.error('places: search failed', { error });
    res.status(500).json({ success: false, error: 'Search failed', message: error.message });
  }
});

/** Poll a search started earlier. */
router.get('/search/:id', async (req: AuthRequest, res: Response) => {
  try {
    const lat = req.query.lat ? Number(req.query.lat) : undefined;
    const lng = req.query.lng ? Number(req.query.lng) : undefined;
    const origin =
      lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lon: lng }
        : undefined;

    const result = await getSearch(req.params.id, origin);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Search not found' });
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('places: poll failed', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/** Instant, cache-only lookup near a coordinate. Never enqueues a job. */
router.get('/nearby', async (req: AuthRequest, res: Response) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'lat and lng are required',
    });
  }

  try {
    const places = await findCachedPlaces({
      keyword: typeof req.query.q === 'string' ? req.query.q : undefined,
      latitude,
      longitude,
      radiusKm: req.query.radiusKm ? Number(req.query.radiusKm) : 25,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    });

    res.json({
      success: true,
      data: { places, locationLabel: nearestKnownPlace(latitude, longitude) },
    });
  } catch (error: any) {
    logger.error('places: nearby failed', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/** One place, with any Migo events we already hold at that venue. */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const place = await prisma.place.findUnique({ where: { id: req.params.id } });

    if (!place || place.isHidden) {
      return res.status(404).json({ success: false, error: 'Place not found' });
    }

    // Surface Migo events at this venue — the bridge between the two features.
    const events = await prisma.event.findMany({
      where: {
        status: 'ACTIVE',
        visibility: 'PUBLIC',
        startDate: { gte: new Date() },
        venueName: { contains: place.title.split(' ').slice(0, 3).join(' '), mode: 'insensitive' },
      },
      orderBy: { startDate: 'asc' },
      take: 10,
      select: {
        id: true,
        title: true,
        startDate: true,
        coverImage: true,
        priceFrom: true,
        currency: true,
        isFree: true,
      },
    });

    const lat = req.query.lat ? Number(req.query.lat) : null;
    const lng = req.query.lng ? Number(req.query.lng) : null;
    const distanceKm =
      lat != null &&
      lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      place.latitude != null &&
      place.longitude != null
        ? Number(haversineKm(lat, lng, place.latitude, place.longitude).toFixed(2))
        : null;

    res.json({ success: true, data: { ...place, distanceKm, events } });
  } catch (error: any) {
    logger.error('places: detail failed', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
