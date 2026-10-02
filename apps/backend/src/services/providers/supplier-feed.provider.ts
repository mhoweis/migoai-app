import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';
import config from '../../config/env';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

const MAX_FEED_BYTES = 5 * 1024 * 1024;
const MAX_FEED_EVENTS = 500;
const REQUEST_TIMEOUT_MS = 15_000;
const dateValue = z.string().min(1).refine(value => !Number.isNaN(new Date(value).getTime()));

const feedEventSchema = z.object({
  id: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(255),
  startDate: dateValue,
  endDate: dateValue.optional(),
  description: z.string().max(20_000).optional(),
  venueName: z.string().max(255).optional(),
  address: z.string().max(2_000).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  coverImage: z.string().max(5_000).optional(),
  priceFrom: z.number().nonnegative().optional(),
  priceTo: z.number().nonnegative().optional(),
  currency: z.string().trim().length(3).optional(),
  isFree: z.boolean().optional(),
  category: z.string().trim().max(100).optional(),
  url: z.string().url().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
});

type SupplierFeed = {
  sourceKey: string;
  feedUrl: string | null;
};

const privateIpv4 = (address: string): boolean => {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224
    || (a === 255 && b === 255 && c === 255);
};

const privateIpv6 = (address: string): boolean => {
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (isIP(mapped) === 4) return privateIpv4(mapped);
    const hex = mapped.split(':').slice(-2).map(part => parseInt(part || '0', 16));
    if (hex.length === 2 && hex.every(Number.isFinite)) {
      return privateIpv4(`${hex[0] >> 8}.${hex[0] & 255}.${hex[1] >> 8}.${hex[1] & 255}`);
    }
  }
  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized)
    || normalized.startsWith('ff');
};

const isPrivateAddress = (address: string): boolean => {
  const family = isIP(address);
  if (family === 4) return privateIpv4(address);
  if (family === 6) return privateIpv6(address);
  return true;
};

export function validateSupplierFeedUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Feed URL must be a valid URL');
  }
  const allowPrivate = config.SUPPLIER_FEED_ALLOW_PRIVATE_HOSTS && config.isDevelopment;
  if (url.username || url.password) throw new Error('Feed URL must not contain credentials');
  if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:')) {
    throw new Error('Supplier feeds must use HTTPS');
  }
  if (!allowPrivate && (
    url.hostname === 'localhost'
    || url.hostname.endsWith('.localhost')
    || url.hostname.endsWith('.local')
    || url.hostname.endsWith('.internal')
    || url.hostname === 'metadata'
    || url.hostname === 'metadata.google.internal'
  )) {
    throw new Error('Private feed hosts are not allowed');
  }
  return url;
}

async function assertPublicTarget(url: URL): Promise<void> {
  const validated = validateSupplierFeedUrl(url.toString());
  if (config.SUPPLIER_FEED_ALLOW_PRIVATE_HOSTS && config.isDevelopment) return;
  const addresses = isIP(validated.hostname)
    ? [{ address: validated.hostname }]
    : await lookup(validated.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Supplier feed host resolves to a private or reserved address');
  }
}

async function fetchFeed(url: URL): Promise<unknown> {
  let target = url;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    await assertPublicTarget(target);
    const response = await fetch(target, {
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === 5) throw new Error('Supplier feed redirect limit exceeded');
      target = new URL(location, target);
      continue;
    }
    if (!response.ok) throw new Error(`Supplier feed returned HTTP ${response.status}`);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_FEED_BYTES) throw new Error('Supplier feed exceeds the 5 MB limit');
    if (!response.body) throw new Error('Supplier feed response is empty');

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_FEED_BYTES) {
          await reader.cancel();
          throw new Error('Supplier feed exceeds the 5 MB limit');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const text = Buffer.concat(chunks).toString('utf8');
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error('Supplier feed must be valid JSON');
    }
  }
  throw new Error('Supplier feed redirect limit exceeded');
}

export class SupplierFeedProvider implements EventProvider {
  readonly name: string;
  lastFetchedCount = 0;
  lastValidationErrors = 0;

  constructor(private readonly supplier: SupplierFeed) {
    this.name = supplier.sourceKey;
  }

  isConfigured(): boolean {
    return Boolean(this.supplier.feedUrl);
  }

  async fetchEvents(_window: SyncWindow): Promise<NormalizedEvent[]> {
    this.lastFetchedCount = 0;
    this.lastValidationErrors = 0;
    if (!this.supplier.feedUrl) return [];
    const raw = await fetchFeed(validateSupplierFeedUrl(this.supplier.feedUrl));
    const rows = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object' && Array.isArray((raw as { events?: unknown }).events)
        ? (raw as { events: unknown[] }).events
        : null;
    if (!rows) throw new Error('Supplier feed must be an array or an object with an events array');

    this.lastFetchedCount = rows.length;
    const boundedRows = rows.slice(0, MAX_FEED_EVENTS);
    this.lastValidationErrors = Math.max(0, rows.length - boundedRows.length);
    const events: NormalizedEvent[] = [];
    for (const row of boundedRows) {
      const result = feedEventSchema.safeParse(row);
      if (!result.success) {
        this.lastValidationErrors += 1;
        continue;
      }
      const item = result.data;
      events.push({
        externalId: item.id,
        externalSource: this.supplier.sourceKey,
        title: item.title,
        description: item.description,
        startDate: new Date(item.startDate),
        endDate: item.endDate ? new Date(item.endDate) : undefined,
        venueName: item.venueName,
        address: item.address,
        city: item.city || 'Dubai',
        country: 'United Arab Emirates',
        latitude: item.latitude,
        longitude: item.longitude,
        coverImage: item.coverImage,
        priceFrom: item.priceFrom,
        priceTo: item.priceTo,
        currency: item.currency || 'AED',
        isFree: item.isFree,
        category: item.category,
        externalUrl: item.url,
        tags: item.tags,
      });
    }
    return events;
  }
}
