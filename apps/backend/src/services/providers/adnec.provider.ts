import * as cheerio from 'cheerio';
import logger from '../../utils/logger';
import {
  absoluteUrl,
  cleanDescription,
  cleanTitle,
  htmlHeaders,
  http,
  isDiscoveryProviderDisabled,
  stripHtml,
  validDateRange,
} from './http';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

const SITE_URL = 'https://www.adnec.ae';
const EVENTS_URL = `${SITE_URL}/en/eventlisting`;
const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;
const MAX_CONCURRENCY = 4;

interface AdnecEvent {
  name?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  image?: string | string[];
  location?: {
    name?: string;
    address?: {
      streetAddress?: string;
      addressLocality?: string;
    };
  };
}

const eventSlug = (value: string): string | undefined => {
  const url = absoluteUrl(SITE_URL, value);
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'www.adnec.ae' && parsed.hostname !== 'adnec.ae') return undefined;
    return parsed.pathname.match(/^\/en\/eventlisting\/([^/]+)\/?$/)?.[1];
  } catch {
    return undefined;
  }
};

const gulfDate = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const dateText = value.trim();
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(dateText) ? dateText : `${dateText}+04:00`;
  const date = new Date(zoned);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

class AdnecProvider implements EventProvider {
  readonly name = 'adnec';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured() || window.city.toLowerCase() !== 'abu dhabi') return [];

    try {
      const [sitemapResponse, listingResponse] = await Promise.all([
        http.get<string>(SITEMAP_URL, { headers: htmlHeaders }),
        http.get<string>(EVENTS_URL, { headers: htmlHeaders }),
      ]);
      const slugs = new Set<string>();
      const sitemap = cheerio.load(sitemapResponse.data, { xmlMode: true });
      const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
      sitemap('url').each((_index, element) => {
        const entry = sitemap(element);
        const lastmod = new Date(entry.find('lastmod').first().text().trim());
        const slug = eventSlug(entry.find('loc').first().text().trim());
        if (slug && !Number.isNaN(lastmod.getTime()) && lastmod.getTime() >= cutoff) {
          slugs.add(slug);
        }
      });

      const listing = cheerio.load(listingResponse.data);
      listing('a[href]').each((_index, element) => {
        const slug = eventSlug(listing(element).attr('href') || '');
        if (slug) slugs.add(slug);
      });

      const events: NormalizedEvent[] = [];
      const uniqueEvents = new Map<string, NormalizedEvent>();
      const slugList = [...slugs];
      for (let offset = 0; offset < slugList.length; offset += MAX_CONCURRENCY) {
        const batch = slugList.slice(offset, offset + MAX_CONCURRENCY);
        const results = await Promise.all(batch.map(async slug => {
          try {
            const url = `${EVENTS_URL}/${encodeURIComponent(slug)}`;
            const page = await http.get<string>(url, { headers: htmlHeaders });
            return this.parseEvent(page.data, slug, url);
          } catch (error: any) {
            logger.warn('ADNEC event page skipped', { slug, error: error.message });
            return undefined;
          }
        }));
        for (const event of results) {
          if (event && !uniqueEvents.has(event.externalId)) uniqueEvents.set(event.externalId, event);
        }
      }
      events.push(...uniqueEvents.values());
      return events;
    } catch (error: any) {
      logger.error('ADNEC provider failed', { error: error.message });
      return [];
    }
  }

  private parseEvent(html: string, slug: string, url: string): NormalizedEvent | undefined {
    const $ = cheerio.load(html);
    let eventData: AdnecEvent | undefined;
    $('script[type="application/ld+json"]').each((_index, element) => {
      if (eventData) return;
      const text = $(element).text().replace(/[\u0000-\u001F]+/g, ' ');
      try {
        const parsed = JSON.parse(text);
        const candidates = Array.isArray(parsed) ? parsed : [
          parsed,
          ...(Array.isArray(parsed?.['@graph']) ? parsed['@graph'] : []),
        ];
        const match = candidates.find(candidate => candidate?.['@type'] === 'Event'
          || (Array.isArray(candidate?.['@type']) && candidate['@type'].includes('Event')));
        if (match) eventData = match;
      } catch {
        return;
      }
    });
    if (!eventData) return undefined;

    const title = cleanTitle(stripHtml(eventData.name || ''));
    const startDate = gulfDate(eventData.startDate);
    const endDate = gulfDate(eventData.endDate);
    if (!title || !startDate || !endDate || !validDateRange(startDate, endDate)) return undefined;

    const venueName = eventData.location?.name || 'ADNEC Centre Abu Dhabi';
    const address = eventData.location?.address?.streetAddress;
    const category = /summit|conference|congress|forum|award/i.test(title)
      ? 'Conference'
      : /exhibition|show|expo|fair/i.test(title)
        ? 'Exhibition'
        : 'Business';
    const rawImage = Array.isArray(eventData.image) ? eventData.image[0] : eventData.image;
    const imageUrl = typeof rawImage === 'string'
      ? (rawImage.lastIndexOf('https://') >= 0
        ? rawImage.slice(rawImage.lastIndexOf('https://'))
        : absoluteUrl(SITE_URL, rawImage))
      : undefined;
    const hasAbuDhabiVenue = /abu dhabi/i.test(venueName);

    return {
      externalId: slug,
      externalSource: this.name,
      title,
      description: cleanDescription(eventData.description),
      startDate,
      endDate,
      venueName,
      address,
      city: 'Abu Dhabi',
      country: 'United Arab Emirates',
      ...(hasAbuDhabiVenue ? { latitude: 24.4184, longitude: 54.434 } : {}),
      coverImage: imageUrl,
      externalUrl: url,
      isFree: false,
      currency: 'AED',
      category,
      tags: ['ADNEC'],
    };
  }
}

export const adnecProvider = new AdnecProvider();
export default adnecProvider;
