/**
 * Affiliate handling for Migo (client side).
 *
 * The client no longer builds affiliate URLs. It opens the backend redirect:
 *
 *     GET {API}/go/:eventId  →  302  →  supplier
 *
 * The backend resolves the supplier, wraps the URL exactly once, logs the
 * click as a UserSignal and increments Event.clickCount. That means:
 *
 *   - no more double-wrapped tracking URLs (which silently lose commission)
 *   - the affiliate `ref` is no longer compiled into the app bundle, so it can
 *     change without an app store release
 *   - click-outs are attributable to a user, an event and a feed placement
 */

import { getApiBaseUrl } from './index';

export const PLATINUMLIST_BASE = 'https://platinumlist.net';

/**
 * The URL to open when the user taps "Book tickets".
 *
 * @param eventId   Migo event ID
 * @param placement Where the tap happened, for attribution ("detail", "ai_feed")
 */
export function getBookingUrl(eventId: string, placement?: string): string {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const query = placement ? `?from=${encodeURIComponent(placement)}` : '';
  return `${base}/go/${encodeURIComponent(eventId)}${query}`;
}

/**
 * True only for a genuine Platinumlist event URL.
 *
 * The old check was `url.includes('platinumlist.net')`, which matched every
 * affiliate-wrapped URL regardless of where the event actually came from —
 * so everything looked like a Platinumlist event. This parses the host.
 */
export function isPlatinumlistUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'platinumlist.net' || host === 'www.platinumlist.net';
  } catch {
    return false;
  }
}

/** Human-readable supplier name for a "View on …" label. */
export function supplierLabel(event: {
  externalSource?: string | null;
  externalUrl?: string | null;
}): string {
  if (event.externalSource) {
    const source = event.externalSource.toLowerCase();
    if (source === 'platinumlist') return 'Platinumlist';
    return event.externalSource;
  }
  if (isPlatinumlistUrl(event.externalUrl)) return 'Platinumlist';
  return 'Website';
}
