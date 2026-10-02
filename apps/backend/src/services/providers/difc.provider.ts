import config from '../../config/env';
import logger from '../../utils/logger';
import {
  absoluteUrl,
  cleanDescription,
  cleanTitle,
  http,
  isDiscoveryProviderDisabled,
  parseDubaiDate,
  validDateRange,
} from './http';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

const ALGOLIA_URL = 'https://S0C8RPT3T2-dsn.algolia.net/1/indexes/crawler_difc_prod_website_search_whatson_soonest/query';
const DEFAULT_APP_ID = 'S0C8RPT3T2';
const DEFAULT_API_KEY = '33758e1162a10a30537f4d790979c752';
const EVENTS_URL = 'https://www.difc.com/whats-on/events';
const PAGE_SIZE = 200;
const MAX_PAGES = 5;

interface AlgoliaHit {
  objectID?: string;
  itemId?: string | number;
  title?: string;
  heading?: string;
  metaDescription?: string;
  content?: string;
  thumbnailImage?: string;
  entityDate?: string | number;
  dateDisplayTitle?: string;
  locationTitle?: string;
  pageTags?: string[];
  trend?: { value?: string };
  industry?: { value?: string };
  externalLink?: { targetUrl?: string };
}

interface AlgoliaResponse {
  hits?: AlgoliaHit[];
  nbPages?: number;
}

interface DateParts {
  day: number;
  month: string;
  year: number;
}

export interface DifcDateRange {
  startDate: Date;
  endDate: Date;
}

const monthNumber = (month: string): number => {
  const value = new Date(`${month} 1, 2000 UTC`).getUTCMonth();
  return Number.isNaN(value) ? -1 : value;
};

const datePart = (day: number, month: string, year: number, endOfDay = false): Date | undefined => {
  if (day < 1 || day > 31 || monthNumber(month) < 0 || year < 1900 || year > 2200) return undefined;
  const date = parseDubaiDate(`${day} ${month} ${year}`, endOfDay ? '23:59' : '00:00');
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
};

const entityDateParts = (value?: string | number): DateParts | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = typeof value === 'number' || /^\d{10,}$/.test(value) ? Number(value) : undefined;
  const instant = new Date(numeric ?? value);
  if (Number.isNaN(instant.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    day: Number(values.day),
    month: values.month,
    year: Number(values.year),
  };
};

const makeRange = (
  start: DateParts,
  end: DateParts = start,
): DifcDateRange | undefined => {
  const startDate = datePart(start.day, start.month, start.year);
  const endDate = datePart(end.day, end.month, end.year, true);
  if (!startDate || !endDate || startDate > endDate) return undefined;
  return { startDate, endDate };
};

export function parseDifcDateRange(
  dateDisplayTitle?: string | null,
  entityDate?: string | number,
): DifcDateRange | undefined {
  const input = (dateDisplayTitle || '')
    .trim()
    .replace(/^Date:\s*/i, '')
    .replace(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+/i, '')
    .replace(/\s+/g, ' ');
  if (!input) return undefined;

  const till = input.match(/^till\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/i);
  if (till) {
    const start = entityDateParts(entityDate);
    const end: DateParts = { day: Number(till[1]), month: till[2], year: Number(till[3]) };
    return start ? makeRange(start, end) : undefined;
  }

  const explicitYears = input.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*(?:-|–|—|to)\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/i,
  );
  if (explicitYears) {
    return makeRange(
      { day: Number(explicitYears[1]), month: explicitYears[2], year: Number(explicitYears[3]) },
      { day: Number(explicitYears[4]), month: explicitYears[5], year: Number(explicitYears[6]) },
    );
  }

  const crossMonth = input.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s*(?:-|–|—|to)\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/i,
  );
  if (crossMonth) {
    const endYear = Number(crossMonth[5]);
    const startMonth = monthNumber(crossMonth[2]);
    const endMonth = monthNumber(crossMonth[4]);
    if (startMonth < 0 || endMonth < 0) return undefined;
    return makeRange(
      {
        day: Number(crossMonth[1]),
        month: crossMonth[2],
        year: startMonth > endMonth ? endYear - 1 : endYear,
      },
      { day: Number(crossMonth[3]), month: crossMonth[4], year: endYear },
    );
  }

  const sameMonthRange = input.match(
    /^(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/i,
  );
  if (sameMonthRange) {
    const year = Number(sameMonthRange[4]);
    return makeRange(
      { day: Number(sameMonthRange[1]), month: sameMonthRange[3], year },
      { day: Number(sameMonthRange[2]), month: sameMonthRange[3], year },
    );
  }

  const singleDate = input.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/i);
  if (singleDate) {
    const date: DateParts = {
      day: Number(singleDate[1]),
      month: singleDate[2],
      year: Number(singleDate[3]),
    };
    return makeRange(date);
  }

  return undefined;
}

const sourceTags = (hit: AlgoliaHit): string[] => {
  const values = [
    ...(Array.isArray(hit.pageTags) ? hit.pageTags : []),
    hit.trend?.value,
    hit.industry?.value,
    'DIFC',
  ];
  const seen = new Set<string>();
  return values.reduce<string[]>((tags, value) => {
    if (typeof value !== 'string' || !value.trim()) return tags;
    const tag = value.trim();
    const key = tag.toLowerCase();
    if (seen.has(key)) return tags;
    seen.add(key);
    tags.push(tag);
    return tags;
  }, []);
};

const fullSizeImage = (value?: string): string | undefined => {
  if (!value) return undefined;
  const imageUrl = absoluteUrl('https://www.difc.com', value);
  if (!imageUrl) return undefined;
  try {
    const url = new URL(imageUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (['h', 'w', 'iar'].includes(key.toLowerCase())) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return imageUrl;
  }
};

export class DifcProvider implements EventProvider {
  readonly name = 'difc';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured() || window.city.toLowerCase() !== 'dubai') return [];

    try {
      const events: NormalizedEvent[] = [];
      let page = 0;
      let pageCount = 1;
      while (page < pageCount && page < MAX_PAGES) {
        const params = new URLSearchParams({
          hitsPerPage: String(PAGE_SIZE),
          page: String(page),
          filters: 'pageType.key:Event',
        });
        const response = await http.post<AlgoliaResponse>(
          ALGOLIA_URL,
          { params: params.toString() },
          {
            headers: {
              'X-Algolia-Application-Id': config.DIFC_ALGOLIA_APP_ID || DEFAULT_APP_ID,
              'X-Algolia-API-Key': config.DIFC_ALGOLIA_API_KEY || DEFAULT_API_KEY,
              Referer: EVENTS_URL,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
          },
        );
        if (!Array.isArray(response.data?.hits)) break;
        events.push(...response.data.hits
          .map(hit => this.normalize(hit))
          .filter((event): event is NormalizedEvent => Boolean(event)));
        pageCount = Math.min(Math.max(1, response.data.nbPages || 1), MAX_PAGES);
        page += 1;
      }

      return [...new Map(events.map(event => [event.externalId, event])).values()];
    } catch (error: any) {
      logger.error('DIFC provider failed', { error: error.message });
      return [];
    }
  }

  private normalize(hit: AlgoliaHit): NormalizedEvent | undefined {
    const rawTitle = cleanTitle(hit.heading)
      || cleanTitle(hit.title)?.replace(/\s*\|\s*(?:DIFC|\d{4})\s*$/i, '');
    const title = cleanTitle(rawTitle);
    const dateRange = parseDifcDateRange(hit.dateDisplayTitle, hit.entityDate);
    const externalId = String(hit.itemId || hit.objectID || '').trim();
    if (!title || !externalId || !dateRange || !validDateRange(dateRange.startDate, dateRange.endDate)) {
      return undefined;
    }

    const location = (hit.locationTitle || '').trim().replace(/\.+$/, '').trim();
    const venueName = location || 'DIFC';
    const useDifcCoordinates = !location || /\b(?:DIFC|Gate Village|Gate Avenue)\b/i.test(location);
    const description = cleanDescription(hit.metaDescription)
      || cleanDescription((hit.content || '').slice(0, 600));
    const category = (hit.pageTags || []).find(tag => (
      typeof tag === 'string' && tag.trim() && tag.trim().toLowerCase() !== 'mega event'
    )) || 'Business';
    const objectUrl = hit.objectID ? absoluteUrl('https://www.difc.com', hit.objectID) : undefined;
    const externalUrl = cleanTitle(hit.externalLink?.targetUrl) || objectUrl;

    return {
      externalId,
      externalSource: this.name,
      title,
      description,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      venueName,
      address: `${venueName}, Dubai`,
      city: 'Dubai',
      country: 'United Arab Emirates',
      latitude: useDifcCoordinates ? 25.2131 : undefined,
      longitude: useDifcCoordinates ? 55.2797 : undefined,
      coverImage: fullSizeImage(hit.thumbnailImage),
      externalUrl,
      category: String(category).trim().slice(0, 100),
      tags: sourceTags(hit),
    };
  }
}

export const difcProvider = new DifcProvider();
export default difcProvider;
