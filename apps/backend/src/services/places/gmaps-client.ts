// src/services/places/gmaps-client.ts
//
// Typed client for the local google-maps-scraper container
// (gosom/google-maps-scraper, MIT — see docker/README-scraper.md).
//
// The container exposes three endpoints we care about:
//   POST /api/v1/jobs              → { id }
//   GET  /api/v1/jobs/{id}         → { Status: "ok" | "failed" | ... }
//   GET  /api/v1/jobs/{id}/download → CSV
//
// It has NO authentication of its own, so it must stay bound to a private
// interface. See SCRAPER_BASE_URL in .env.

import logger from '../../utils/logger';

const BASE_URL = (process.env.SCRAPER_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const API_KEY = process.env.SCRAPER_API_KEY || '';
const REQUEST_TIMEOUT_MS = Number(process.env.SCRAPER_REQUEST_TIMEOUT_MS ?? 60_000);

export interface ScrapeJobRequest {
  keywords: string[];
  lat: number;
  lon: number;
  /** Results per keyword. Start at 5; raising this raises block risk. */
  depth?: number;
  radiusMeters?: number;
  zoom?: number;
  lang?: string;
  /** Job time limit in SECONDS. */
  maxTimeSeconds?: number;
  /**
   * Email extraction visits every business website and is much slower.
   * Off by default here: scraped emails are personal data under the UAE PDPL
   * and GDPR, and Migo has no lawful basis to collect them for venue metadata.
   */
  email?: boolean;
  /** SOCKS5/HTTP proxies. Strongly recommended for large or repeated runs. */
  proxies?: string[];
}

/** One row from the scraper's CSV, normalized. */
export interface ScrapedPlace {
  externalId: string;
  title: string;
  category: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  mapsUrl: string | null;
  thumbnail: string | null;
  priceRange: string | null;
  rating: number | null;
  reviewCount: number | null;
}

export class ScraperUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(`Google Maps scraper not reachable at ${BASE_URL}`);
    this.name = 'ScraperUnavailableError';
    (this as any).cause = cause;
  }
}

export class ScrapeJobFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScrapeJobFailedError';
  }
}

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['X-API-Key'] = API_KEY;

  try {
    return await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new ScraperUnavailableError(error);
  } finally {
    clearTimeout(timer);
  }
}

/** True when the container is up and answering. */
export async function isHealthy(): Promise<boolean> {
  try {
    const res = await request('GET', '/api/v1/jobs');
    return res.ok;
  } catch {
    return false;
  }
}

export async function createJob(req: ScrapeJobRequest): Promise<string> {
  const body = {
    name: `migo-${Date.now()}`,
    keywords: req.keywords,
    lang: req.lang ?? 'en',
    zoom: req.zoom ?? 15,
    // The API wants coordinates as strings.
    lat: String(req.lat),
    lon: String(req.lon),
    fast_mode: false,
    radius: req.radiusMeters ?? 10_000,
    depth: req.depth ?? 5,
    email: req.email ?? false,
    max_time: req.maxTimeSeconds ?? 600,
    ...(req.proxies?.length ? { proxies: req.proxies } : {}),
  };

  const res = await request('POST', '/api/v1/jobs', body);
  if (!res.ok) {
    throw new ScrapeJobFailedError(`Create job failed: HTTP ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new ScrapeJobFailedError('Scraper returned no job id');
  return json.id;
}

export type JobStatus = 'pending' | 'working' | 'ok' | 'failed';

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await request('GET', `/api/v1/jobs/${jobId}`);
  if (!res.ok) throw new ScrapeJobFailedError(`Status check failed: HTTP ${res.status}`);
  const json = (await res.json()) as { Status?: string; status?: string };
  const raw = (json.Status ?? json.status ?? 'pending').toLowerCase();
  if (raw === 'ok' || raw === 'failed') return raw;
  return raw === 'working' ? 'working' : 'pending';
}

export async function deleteJob(jobId: string): Promise<void> {
  try {
    await request('DELETE', `/api/v1/jobs/${jobId}`);
  } catch (error) {
    logger.warn('gmaps-client: failed to delete job', { jobId, error });
  }
}

// ── CSV parsing ──────────────────────────────────────────────────────────────

/** Minimal RFC-4180 parser. The scraper quotes fields containing commas. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (!header) return [];

  return body.map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key.trim()] = (cells[index] ?? '').trim();
    });
    return record;
  });
}

function num(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function str(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

/**
 * Stable identity for a place. Prefers Google's own IDs; falls back to a
 * deterministic key so re-running a query updates rather than duplicates.
 */
function identify(row: Record<string, string>): string {
  const candidate = row.cid || row.data_id || row.place_id || row.fid;
  if (candidate?.trim()) return candidate.trim().slice(0, 191);

  const basis = `${row.title ?? ''}|${row.address ?? row.complete_address ?? ''}`.toLowerCase();
  // Not cryptographic — just a compact deterministic fallback key.
  let hash = 0;
  for (let i = 0; i < basis.length; i++) {
    hash = (hash << 5) - hash + basis.charCodeAt(i);
    hash |= 0;
  }
  return `fallback-${Math.abs(hash).toString(36)}-${basis.slice(0, 60).replace(/[^a-z0-9]+/g, '-')}`.slice(0, 191);
}

export async function downloadResults(jobId: string): Promise<ScrapedPlace[]> {
  const res = await request('GET', `/api/v1/jobs/${jobId}/download`);
  if (!res.ok) throw new ScrapeJobFailedError(`Download failed: HTTP ${res.status}`);

  const rows = parseCsv(await res.text());

  return rows
    .filter((row) => (row.title ?? '').trim().length > 0)
    .map((row) => ({
      externalId: identify(row),
      title: row.title.trim().slice(0, 300),
      category: str(row.category)?.slice(0, 150) ?? null,
      address: str(row.complete_address) ?? str(row.address),
      latitude: num(row.latitude),
      longitude: num(row.longitude),
      phone: str(row.phone)?.slice(0, 60) ?? null,
      website: str(row.website),
      mapsUrl: str(row.link),
      thumbnail: str(row.thumbnail),
      priceRange: str(row.price_range)?.slice(0, 20) ?? null,
      rating: num(row.review_rating),
      reviewCount: num(row.review_count),
    }));
}

export const scraperBaseUrl = BASE_URL;
