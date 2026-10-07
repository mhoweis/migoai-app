import puppeteer from 'puppeteer';
import logger from '../../utils/logger';
import { cleanDescription, cleanTitle, http, isDiscoveryProviderDisabled, numberValue, parseDubaiDate, validDateRange } from './http';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

const BASE_URL = 'https://mydubaicommunities.com';
const EVENTS_PAGE = `${BASE_URL}/events`;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const BROWSER_TIMEOUT_MS = 45_000;
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const listingPath = (page: number): string =>
  `/api/events/listing/custom?pageSize=${PAGE_SIZE}&page=${page}&locale=en&eventPeriod=upcoming&sort[0]=start_date%3AASC`;

interface StrapiRelation<T> {
  data?: { id?: number; attributes?: T } | null;
}

interface Session {
  attributes?: { start_date?: string; end_date?: string; start_time?: string; end_time?: string; to_delete?: boolean };
}

interface MediaAttributes {
  url?: string;
  formats?: Record<string, { url?: string }>;
}

interface ListingItem {
  id: number;
  attributes?: {
    name?: string;
    event_slug?: string;
    description?: string | null;
    about_event?: string | null;
    location?: string | null;
    start_date?: string;
    end_date?: string;
    start_time?: string | null;
    end_time?: string | null;
    registration_link?: string | null;
    event_type?: StrapiRelation<{ UID?: string; Title?: string }>;
    banner_image?: StrapiRelation<MediaAttributes>;
    thumbnail_image?: StrapiRelation<MediaAttributes>;
    EventCoordinates?: { lat?: number | string; lng?: number | string } | null;
    EventLocation?: StrapiRelation<{ Title?: string }>;
    community?: StrapiRelation<{
      CommunityURL?: string;
      CommunityCategory?: StrapiRelation<{ Title?: string }>;
      CommunitySubCategory?: StrapiRelation<{ Title?: string }>;
    }>;
    RecurringSessions?: { data?: Session[] };
  };
}

interface ListingPage {
  data?: ListingItem[];
  meta?: { pagination?: { pageCount?: number } };
}

const humanize = (slug?: string): string | undefined =>
  slug
    ? slug.split('-').filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(' ')
    : undefined;

const time = (value?: string | null): string | undefined => value ? value.slice(0, 5) : undefined;

class MyDubaiCommunitiesProvider implements EventProvider {
  readonly name = 'my-dubai-communities';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured() || window.city.toLowerCase() !== 'dubai') return [];

    try {
      const items = await this.fetchListing();
      const events = items
        .map(item => this.normalize(item))
        .filter((event): event is NormalizedEvent => Boolean(event));
      return [...new Map(events.map(event => [event.externalId, event])).values()];
    } catch (error: any) {
      logger.error('MyDubai Communities provider failed', { error: error.message });
      return [];
    }
  }

  private async fetchListing(): Promise<ListingItem[]> {
    try {
      return await this.collectPages(async path => {
        const response = await http.get<ListingPage>(`${BASE_URL}${path}`, {
          headers: { Accept: 'application/json', Referer: EVENTS_PAGE },
        });
        return response.data;
      });
    } catch (error: any) {
      if (error.response?.status !== 403) throw error;
      return this.fetchListingInBrowser();
    }
  }

  private async fetchListingInBrowser(): Promise<ListingItem[]> {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
    });
    try {
      const page = await browser.newPage();
      await page.setUserAgent(BROWSER_USER_AGENT);
      await page.goto(EVENTS_PAGE, { waitUntil: 'domcontentloaded', timeout: BROWSER_TIMEOUT_MS });
      return await this.collectPages(path =>
        page.evaluate(async (url: string) => {
          const response = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!response.ok) throw new Error(`Listing request failed with ${response.status}`);
          return response.json();
        }, path) as Promise<ListingPage>,
      );
    } finally {
      await browser.close();
    }
  }

  private async collectPages(load: (path: string) => Promise<ListingPage>): Promise<ListingItem[]> {
    const items: ListingItem[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const body = await load(listingPath(page));
      if (!Array.isArray(body?.data)) break;
      items.push(...body.data);
      if (page >= (body.meta?.pagination?.pageCount || 1)) break;
    }
    return items;
  }

  private normalize(item: ListingItem): NormalizedEvent | undefined {
    const attributes = item.attributes;
    const title = cleanTitle(attributes?.name);
    if (!attributes || !title || attributes.event_type?.data?.attributes?.UID === 'virtual') return undefined;

    const session = (attributes.RecurringSessions?.data || [])
      .map(entry => entry.attributes)
      .filter(entry => entry?.start_date && !entry.to_delete)
      .sort((a, b) => String(a!.start_date).localeCompare(String(b!.start_date)))[0];
    const startDay = session?.start_date || attributes.start_date;
    if (!startDay) return undefined;
    const endDay = session ? session.end_date || session.start_date : attributes.end_date || attributes.start_date;
    const startTime = time(session?.start_time ?? attributes.start_time);
    const endTime = time(session?.end_time ?? attributes.end_time);

    const startDate = parseDubaiDate(startDay, startTime || '00:00');
    const endDate = endDay ? parseDubaiDate(endDay, endTime || '23:59') : undefined;
    if (!validDateRange(startDate, endDate)) return undefined;

    const community = attributes.community?.data?.attributes;
    const communityName = humanize(community?.CommunityURL);
    const category = community?.CommunityCategory?.data?.attributes?.Title?.trim();
    const subCategory = community?.CommunitySubCategory?.data?.attributes?.Title?.trim();
    const area = attributes.EventLocation?.data?.attributes?.Title?.trim();
    const knownArea = area && area.toLowerCase() !== 'other' ? area : undefined;
    const venueName = cleanTitle(attributes.location) || knownArea || communityName;

    const latitude = numberValue(attributes.EventCoordinates?.lat);
    const longitude = numberValue(attributes.EventCoordinates?.lng);
    const hasCoordinates = Boolean(latitude && longitude);

    const image = attributes.banner_image?.data?.attributes || attributes.thumbnail_image?.data?.attributes;
    const description = cleanDescription(attributes.about_event || attributes.description)
      || cleanDescription(`${title}${communityName ? ` by ${communityName}` : ''} on MyDubai Communities`);

    return {
      externalId: String(item.id),
      externalSource: this.name,
      title,
      description,
      startDate,
      endDate,
      venueName,
      address: [knownArea, 'Dubai'].filter(Boolean).join(', '),
      city: 'Dubai',
      country: 'United Arab Emirates',
      latitude: hasCoordinates ? latitude : undefined,
      longitude: hasCoordinates ? longitude : undefined,
      coverImage: image?.formats?.large?.url || image?.url,
      externalUrl: attributes.event_slug ? `${EVENTS_PAGE}/${attributes.event_slug}` : attributes.registration_link || EVENTS_PAGE,
      category: category?.slice(0, 100),
      tags: [category, subCategory, communityName, 'Community'].filter((tag): tag is string => Boolean(tag)),
    };
  }
}

export const myDubaiCommunitiesProvider = new MyDubaiCommunitiesProvider();
export default myDubaiCommunitiesProvider;
