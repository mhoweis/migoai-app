// src/services/affiliate.service.ts
//
// Affiliate link building lives here, on the server, for three reasons:
//
//   1. The `ref` is no longer compiled into the mobile bundle, so changing
//      affiliate parameters no longer needs an app store release.
//   2. We wrap exactly once. The importer used to store an already-wrapped
//      URL in `externalUrl` and the mobile client wrapped it again, producing
//      a nested tracking URL — the classic way to silently lose commission.
//   3. Every click gets an opaque sub-ID token, so a supplier's conversion
//      report can be joined back to a user, an event and a feed placement.

import crypto from 'crypto';

export interface AffiliateSupplier {
  /** Matches Event.externalSource / Event.source, lowercased. */
  key: string;
  label: string;
  /** Hostnames that indicate this supplier owns the raw URL. */
  hosts: string[];
  /** Builds the outbound URL. `subId` is our opaque click token. */
  build(rawUrl: string, subId: string): string;
  /** Homepage fallback when an event has no usable URL. */
  fallback: string;
}

const PLATINUMLIST_REF = process.env.PLATINUMLIST_AFF_REF || 'nmu2yjg';
/**
 * Platinumlist sub-ID support is unconfirmed — pending their answer, set
 * PLATINUMLIST_SUBID_PARAM to `subid`, `sub_id` or `p1` once they tell us.
 * Until then we send no sub-ID rather than an ignored parameter.
 */
const PLATINUMLIST_SUBID_PARAM = process.env.PLATINUMLIST_SUBID_PARAM || '';

const SUPPLIERS: AffiliateSupplier[] = [
  {
    key: 'platinumlist',
    label: 'Platinumlist',
    hosts: ['platinumlist.net', 'www.platinumlist.net'],
    fallback: 'https://platinumlist.net',
    build(rawUrl, subId) {
      const url = new URL('https://platinumlist.net/aff/');
      url.searchParams.set('ref', PLATINUMLIST_REF);
      url.searchParams.set('link', rawUrl);
      if (PLATINUMLIST_SUBID_PARAM) url.searchParams.set(PLATINUMLIST_SUBID_PARAM, subId);
      return url.toString();
    },
  },
];

const BY_KEY = new Map(SUPPLIERS.map((supplier) => [supplier.key, supplier]));

/**
 * True only when the URL is a genuine Platinumlist event URL.
 *
 * The old client-side check used `url.includes('platinumlist.net')`, which
 * matched every wrapped URL regardless of where the event actually came from.
 * Parsing the host and ignoring the `link` parameter fixes that.
 */
export function isSupplierUrl(rawUrl: string | null | undefined, key: string): boolean {
  const supplier = BY_KEY.get(key);
  if (!rawUrl || !supplier) return false;
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return supplier.hosts.includes(host);
  } catch {
    return false;
  }
}

/** Strips one layer of affiliate wrapping, for URLs imported before the fix. */
export function unwrapAffiliateUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.pathname.startsWith('/aff') && url.searchParams.has('link')) {
      const inner = url.searchParams.get('link');
      if (inner) return unwrapAffiliateUrl(inner) ?? inner;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

/** Resolves a supplier from the event's source fields, then from the URL host. */
export function resolveSupplier(event: {
  externalSource?: string | null;
  source?: string | null;
  externalUrl?: string | null;
}): AffiliateSupplier | null {
  const declared = (event.externalSource || event.source || '').toLowerCase().trim();
  if (declared && BY_KEY.has(declared)) return BY_KEY.get(declared)!;

  const raw = unwrapAffiliateUrl(event.externalUrl);
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return SUPPLIERS.find((supplier) => supplier.hosts.includes(host)) ?? null;
  } catch {
    return null;
  }
}

export function newClickToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function hashIp(ip?: string): string | null {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT || 'migo-dev-salt';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 64);
}

export interface ResolvedClickOut {
  supplier: string;
  targetUrl: string;
  /** The raw, unwrapped destination — useful for display and debugging. */
  rawUrl: string;
}

/**
 * Builds the outbound URL for an event. Always wraps exactly once, and
 * unwraps anything a previous importer double-wrapped.
 */
export function buildClickOut(
  event: { externalSource?: string | null; source?: string | null; externalUrl?: string | null; ticketUrl?: string | null; website?: string | null },
  subId: string
): ResolvedClickOut | null {
  const raw =
    unwrapAffiliateUrl(event.externalUrl) ||
    unwrapAffiliateUrl(event.ticketUrl) ||
    unwrapAffiliateUrl(event.website);

  const supplier = resolveSupplier(event);

  if (!raw) {
    if (!supplier) return null;
    return { supplier: supplier.key, targetUrl: supplier.fallback, rawUrl: supplier.fallback };
  }

  if (!supplier) {
    // Not a partner — send the user straight to the source, still tracked.
    return { supplier: 'direct', targetUrl: raw, rawUrl: raw };
  }

  return { supplier: supplier.key, targetUrl: supplier.build(raw, subId), rawUrl: raw };
}
