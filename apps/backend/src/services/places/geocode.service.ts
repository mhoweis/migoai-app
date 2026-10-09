// src/services/places/geocode.service.ts
//
// City name → coordinates. UAE locations are answered from a local table so
// the common case costs nothing and never depends on a third party; anything
// else falls back to OpenStreetMap's Nominatim.
//
// Nominatim's usage policy allows roughly one request per second and requires
// a descriptive User-Agent, so results are cached in-process.

import logger from '../../utils/logger';

export interface Coordinates {
  latitude: number;
  longitude: number;
  label: string;
}

/** Emirates, major districts and the venue clusters Migo cares about. */
const UAE_PLACES: Record<string, Coordinates> = {
  dubai: { latitude: 25.2048, longitude: 55.2708, label: 'Dubai' },
  'abu dhabi': { latitude: 24.4539, longitude: 54.3773, label: 'Abu Dhabi' },
  sharjah: { latitude: 25.3463, longitude: 55.4209, label: 'Sharjah' },
  ajman: { latitude: 25.4052, longitude: 55.5136, label: 'Ajman' },
  fujairah: { latitude: 25.1288, longitude: 56.3265, label: 'Fujairah' },
  'ras al khaimah': { latitude: 25.7895, longitude: 55.9432, label: 'Ras Al Khaimah' },
  'umm al quwain': { latitude: 25.5647, longitude: 55.5532, label: 'Umm Al Quwain' },
  'al ain': { latitude: 24.1302, longitude: 55.8023, label: 'Al Ain' },

  'dubai marina': { latitude: 25.0805, longitude: 55.1403, label: 'Dubai Marina' },
  jbr: { latitude: 25.0757, longitude: 55.1333, label: 'JBR' },
  downtown: { latitude: 25.1972, longitude: 55.2744, label: 'Downtown Dubai' },
  'downtown dubai': { latitude: 25.1972, longitude: 55.2744, label: 'Downtown Dubai' },
  deira: { latitude: 25.2697, longitude: 55.3095, label: 'Deira' },
  'bur dubai': { latitude: 25.2582, longitude: 55.2962, label: 'Bur Dubai' },
  jumeirah: { latitude: 25.2048, longitude: 55.2409, label: 'Jumeirah' },
  'business bay': { latitude: 25.1857, longitude: 55.2766, label: 'Business Bay' },
  'al quoz': { latitude: 25.1420, longitude: 55.2311, label: 'Al Quoz' },
  'alserkal avenue': { latitude: 25.1417, longitude: 55.2278, label: 'Alserkal Avenue' },
  difc: { latitude: 25.2110, longitude: 55.2796, label: 'DIFC' },
  'city walk': { latitude: 25.2048, longitude: 55.2618, label: 'City Walk' },
  'la mer': { latitude: 25.2301, longitude: 55.2585, label: 'La Mer' },
  'palm jumeirah': { latitude: 25.1124, longitude: 55.1390, label: 'Palm Jumeirah' },
  'dubai hills': { latitude: 25.1043, longitude: 55.2495, label: 'Dubai Hills' },
  jlt: { latitude: 25.0693, longitude: 55.1416, label: 'JLT' },
  'yas island': { latitude: 24.4992, longitude: 54.6072, label: 'Yas Island' },
  'saadiyat island': { latitude: 24.5395, longitude: 54.4370, label: 'Saadiyat Island' },
  'al maryah island': { latitude: 24.5001, longitude: 54.3887, label: 'Al Maryah Island' },
  'expo city': { latitude: 24.9628, longitude: 55.1500, label: 'Expo City Dubai' },
  'global village': { latitude: 25.0700, longitude: 55.3070, label: 'Global Village' },
  'dubai world trade centre': { latitude: 25.2257, longitude: 55.2870, label: 'Dubai World Trade Centre' },
  dwtc: { latitude: 25.2257, longitude: 55.2870, label: 'Dubai World Trade Centre' },
  'dubai exhibition centre': { latitude: 24.9645, longitude: 55.1425, label: 'Dubai Exhibition Centre' },
  'coca-cola arena': { latitude: 25.2036, longitude: 55.2612, label: 'Coca-Cola Arena' },
  'etihad arena': { latitude: 24.4949, longitude: 54.6068, label: 'Etihad Arena' },
  'expo centre sharjah': { latitude: 25.3277, longitude: 55.3778, label: 'Expo Centre Sharjah' },
  'dubai opera': { latitude: 25.1947, longitude: 55.2733, label: 'Dubai Opera' },
  'madinat jumeirah': { latitude: 25.1329, longitude: 55.1852, label: 'Madinat Jumeirah' },
  'dubai festival city': { latitude: 25.2223, longitude: 55.3520, label: 'Dubai Festival City' },
  'jumeirah beach': { latitude: 25.1412, longitude: 55.1852, label: 'Jumeirah Beach' },
  'kite beach': { latitude: 25.1740, longitude: 55.2054, label: 'Kite Beach' },
  'mall of the emirates': { latitude: 25.1181, longitude: 55.2004, label: 'Mall of the Emirates' },
  'dubai mall': { latitude: 25.1975, longitude: 55.2796, label: 'Dubai Mall' },
  'louvre abu dhabi': { latitude: 24.5336, longitude: 54.3984, label: 'Louvre Abu Dhabi' },
  'manarat al saadiyat': { latitude: 24.5438, longitude: 54.4382, label: 'Manarat Al Saadiyat' },
  'emirates palace': { latitude: 24.4615, longitude: 54.3173, label: 'Emirates Palace' },
  'abu dhabi national exhibition centre': { latitude: 24.4184, longitude: 54.4340, label: 'Abu Dhabi National Exhibition Centre' },
  adnec: { latitude: 24.4184, longitude: 54.4340, label: 'Abu Dhabi National Exhibition Centre' },
  'qasr al watan': { latitude: 24.4630, longitude: 54.3080, label: 'Qasr Al Watan' },
  'sharjah art foundation': { latitude: 25.3592, longitude: 55.3865, label: 'Sharjah Art Foundation' },
};

const cache = new Map<string, Coordinates>();
const negativeVenueCache = new Map<string, number>();
const UA = 'MigoAI/1.0 (events discovery; contact: support@migo.ai)';
const UAE_CITY_CENTERS = [
  { latitude: 25.2048, longitude: 55.2708 },
  { latitude: 24.4539, longitude: 54.3773 },
  { latitude: 25.3463, longitude: 55.4209 },
];
const VENUE_CLUSTER_KEYS = [
  'dubai world trade centre',
  'dwtc',
  'dubai exhibition centre',
  'coca-cola arena',
  'etihad arena',
  'expo centre sharjah',
  'dubai opera',
  'madinat jumeirah',
  'dubai festival city',
  'jumeirah beach',
  'kite beach',
  'mall of the emirates',
  'dubai mall',
  'louvre abu dhabi',
  'manarat al saadiyat',
  'emirates palace',
  'abu dhabi national exhibition centre',
  'adnec',
  'qasr al watan',
  'sharjah art foundation',
  'expo city',
  'yas island',
  'alserkal avenue',
  'global village',
  'saadiyat island',
  'al maryah island',
  'dubai marina',
  'downtown dubai',
  'jbr',
  'difc',
  'city walk',
  'la mer',
  'palm jumeirah',
  'dubai hills',
  'jlt',
];

let lastNominatimCall = 0;

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ');
}

async function nominatim(query: string): Promise<Coordinates | null> {
  try {
    const sinceLast = Date.now() - lastNominatimCall;
    if (sinceLast < 1100) await new Promise((r) => setTimeout(r, 1100 - sinceLast));
    lastNominatimCall = Date.now();

    const params = new URLSearchParams({
      format: 'json',
      limit: '1',
      q: query,
      countrycodes: process.env.GEOCODE_COUNTRY_CODES || 'ae',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;

    const hits = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!hits.length) return null;
    return {
      latitude: Number(hits[0].lat),
      longitude: Number(hits[0].lon),
      label: hits[0].display_name.split(',')[0] || query,
    };
  } catch (error) {
    logger.warn('geocode: lookup failed', { query, error });
    return null;
  }
}

function isCityCentroid(coordinates: Coordinates): boolean {
  return UAE_CITY_CENTERS.some((center) => {
    const latitudeMeters = (coordinates.latitude - center.latitude) * 111_000;
    const longitudeMeters = (coordinates.longitude - center.longitude)
      * 111_000
      * Math.cos(center.latitude * Math.PI / 180);
    return Math.sqrt(latitudeMeters ** 2 + longitudeMeters ** 2) < 200;
  });
}

/** Local table first, then Nominatim. Returns null if nothing resolves. */
export async function geocode(place: string): Promise<Coordinates | null> {
  const key = normalize(place);
  if (!key) return null;

  if (UAE_PLACES[key]) return UAE_PLACES[key];
  if (cache.has(key)) return cache.get(key)!;

  // Partial match: "marina dubai" → "dubai marina"
  const partial = Object.keys(UAE_PLACES).find((k) => key.includes(k));
  if (partial) return UAE_PLACES[partial];

  const resolved = await nominatim(place);
  if (resolved) {
    cache.set(key, resolved);
    return resolved;
  }
  return null;
}

export async function geocodeVenue(
  venueName?: string | null,
  address?: string | null,
  city?: string | null,
): Promise<Coordinates | null> {
  const values = [venueName, address, city].filter(Boolean) as string[];
  const key = normalize(values.join(', '));
  if (!key) return null;

  const negativeExpiry = negativeVenueCache.get(key);
  if (negativeExpiry && negativeExpiry > Date.now()) return null;
  if (negativeExpiry) negativeVenueCache.delete(key);

  const fullQuery = [...values, 'United Arab Emirates'].join(', ');
  const fullMatch = await nominatim(fullQuery);
  const shortMatch = venueName && city
    ? await nominatim([venueName, city, 'United Arab Emirates'].join(', '))
    : null;
  const resolved = [fullMatch, shortMatch].find((match) => match && !isCityCentroid(match));
  if (resolved) {
    cache.set(key, resolved);
    return resolved;
  }

  const searchable = normalize([venueName, address].filter(Boolean).join(', '));
  const cluster = [...VENUE_CLUSTER_KEYS]
    .sort((a, b) => b.length - a.length)
    .find((candidate) => searchable.includes(candidate));
  if (cluster) {
    const fallback = UAE_PLACES[cluster];
    if (fallback) {
      cache.set(key, fallback);
      return fallback;
    }
  }

  negativeVenueCache.set(key, Date.now() + 24 * 60 * 60 * 1000);
  return null;
}

/** Nearest known UAE label for a coordinate pair — used for display. */
export function nearestKnownPlace(latitude: number, longitude: number): string | null {
  let best: { label: string; distance: number } | null = null;

  for (const entry of Object.values(UAE_PLACES)) {
    const dLat = entry.latitude - latitude;
    const dLon = entry.longitude - longitude;
    const distance = Math.sqrt(dLat * dLat + dLon * dLon);
    if (!best || distance < best.distance) best = { label: entry.label, distance };
  }

  // ~0.25 degrees ≈ 27 km. Beyond that, do not guess.
  return best && best.distance < 0.25 ? best.label : null;
}

export const knownPlaceNames = Object.keys(UAE_PLACES);
