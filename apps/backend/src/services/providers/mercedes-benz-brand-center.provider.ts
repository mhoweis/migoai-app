import logger from '../../utils/logger';
import {
  cleanDescription,
  cleanTitle,
  http,
  isDiscoveryProviderDisabled,
  numberValue,
  validDateRange,
} from './http';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

const EVENTS_URL = 'https://be.mercedesbenzbrandcenter.ae/V1/getEvents';
const SITE_URL = 'https://mercedesbenzbrandcenter.ae';
const EVENTS_QUERY = {
  aggregateQuery: [
    { $match: { $expr: { $gt: ['$eventEnd', '$$NOW'] } } },
    { $match: { eventStatus: 'confirmed' } },
    { $sort: { eventStart: 1 } },
  ],
};

interface MercedesEvent {
  _id?: string;
  title?: { en?: string };
  details?: { en?: string };
  eventStart?: string;
  eventEnd?: string;
  venue?: { en?: string };
  eventType?: string;
  price?: number | string;
  adultprice?: number | string;
  currency?: string;
  eventTypeMeta?: { en?: string };
  isDraft?: boolean;
  imageUrls?: string[];
}

interface MercedesEventsResponse {
  result?: MercedesEvent[];
}

class MercedesBenzBrandCenterProvider implements EventProvider {
  readonly name = 'mercedes-benz-brand-center';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured() || window.city.toLowerCase() !== 'dubai') return [];

    try {
      const response = await http.post<MercedesEventsResponse>(EVENTS_URL, EVENTS_QUERY, {
        headers: {
          'Content-Type': 'application/json',
          Origin: SITE_URL,
          Referer: `${SITE_URL}/`,
        },
      });
      const uniqueEvents = new Map<string, NormalizedEvent>();

      for (const item of response.data?.result || []) {
        const event = this.normalize(item);
        if (event && !uniqueEvents.has(event.externalId)) {
          uniqueEvents.set(event.externalId, event);
        }
      }

      return [...uniqueEvents.values()];
    } catch (error: any) {
      logger.error('Mercedes-Benz Brand Center provider failed', {
        error: error.message,
      });
      return [];
    }
  }

  private normalize(item: MercedesEvent): NormalizedEvent | undefined {
    const externalId = String(item._id || '').trim();
    const title = cleanTitle(item.title?.en);
    const typeMeta = item.eventTypeMeta?.en?.trim() || '';
    if (
      !externalId
      || !title
      || item.isDraft === true
      || typeMeta.toLowerCase() === 'private event'
      || !item.eventStart
      || !item.eventEnd
    ) {
      return undefined;
    }

    const startDate = new Date(item.eventStart);
    const endDate = new Date(item.eventEnd);
    if (!validDateRange(startDate, endDate)) return undefined;

    const lowerTitle = title.toLowerCase();
    const category = /\b(?:formula\s*1|f1|gp|vs\.?|clásico|clasico|run(?:ning)?|cardio|fitness)\b/i.test(lowerTitle)
      ? 'Sports'
      : /\b(?:exhibition|art|watercolou?r)\b/i.test(lowerTitle)
        ? 'Art'
        : /\b(?:talk|masterclass|workshop|learning)\b/i.test(lowerTitle)
          ? 'Education'
          : 'Other';
    const tags = [...new Set([
      ...(typeMeta && typeMeta.toLowerCase() !== 'all day' ? [typeMeta] : []),
      'Mercedes-Benz',
      'd3',
    ])];
    const isFree = item.eventType?.trim().toLowerCase() !== 'paid';
    const priceFrom = isFree ? undefined : numberValue(item.price) || numberValue(item.adultprice);

    return {
      externalId,
      externalSource: this.name,
      title,
      description: cleanDescription(item.details?.en),
      startDate,
      endDate,
      venueName: 'Mercedes-Benz Brand Center Dubai',
      address: item.venue?.en?.trim() || 'Dubai Design District, Dubai',
      city: 'Dubai',
      country: 'United Arab Emirates',
      latitude: 25.1866,
      longitude: 55.2972,
      coverImage: item.imageUrls?.[0],
      externalUrl: `${SITE_URL}/event/${encodeURIComponent(externalId)}`,
      currency: item.currency || 'AED',
      isFree,
      ...(priceFrom !== undefined ? { priceFrom } : {}),
      category,
      tags,
    };
  }
}

export const mercedesBenzBrandCenterProvider = new MercedesBenzBrandCenterProvider();
export default mercedesBenzBrandCenterProvider;
