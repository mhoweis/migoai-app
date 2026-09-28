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
};

const cache = new Map<string, Coordinates>();
const UA = 'MigoAI/1.0 (events discovery; contact: support@migo.ai)';

let lastNominatimCall = 0;

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ');
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

  try {
    // Respect Nominatim's ~1 req/sec policy.
    const sinceLast = Date.now() - lastNominatimCall;
    if (sinceLast < 1100) await new Promise((r) => setTimeout(r, 1100 - sinceLast));
    lastNominatimCall = Date.now();

    const params = new URLSearchParams({
      format: 'json',
      limit: '1',
      q: place,
      // Bias toward the launch market without hard-restricting it.
      countrycodes: process.env.GEOCODE_COUNTRY_CODES || 'ae',
    });

    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return null;

    const hits = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!hits.length) return null;

    const resolved: Coordinates = {
      latitude: Number(hits[0].lat),
      longitude: Number(hits[0].lon),
      label: hits[0].display_name.split(',')[0] || place,
    };

    cache.set(key, resolved);
    return resolved;
  } catch (error) {
    logger.warn('geocode: lookup failed', { place, error });
    return null;
  }
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
