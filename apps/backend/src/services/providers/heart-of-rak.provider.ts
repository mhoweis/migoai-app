import logger from '../../utils/logger';
import {
  cleanDescription,
  cleanTitle,
  http,
  isDiscoveryProviderDisabled,
  stripHtml,
  validDateRange,
} from './http';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

const GRAPHQL_URL = 'https://dash.heartofrak.com/graphql';
const CALENDAR_URL = 'https://heartofrak.com/en/calendar';
const MAX_PAGES = 10;
const EVENTS_QUERY = `
  query($after: String) {
    events(first: 100, after: $after, where: {wpmlLanguage: "en", upcoming: "1"}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        databaseId
        slug
        title
        excerpt
        content
        featuredImage { node { sourceUrl } }
        kinds { nodes { name } }
        eventDetails { startDate endDate eventLink eventType }
      }
    }
  }
`;

interface HeartOfRakEvent {
  databaseId?: number;
  title?: string;
  excerpt?: string;
  content?: string;
  featuredImage?: { node?: { sourceUrl?: string } };
  kinds?: { nodes?: Array<{ name?: string }> };
  eventDetails?: {
    startDate?: string;
    endDate?: string;
    eventLink?: string;
    eventType?: string;
  };
}

interface GraphqlEventsResponse {
  data?: {
    events?: GraphqlEventsConnection;
  };
}

interface GraphqlEventsConnection {
  pageInfo?: { hasNextPage?: boolean; endCursor?: string };
  nodes?: HeartOfRakEvent[];
}

const gulfDate = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const dateText = value.trim().replace(' ', 'T');
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(dateText) ? dateText : `${dateText}+04:00`;
  const date = new Date(zoned);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

class HeartOfRakProvider implements EventProvider {
  readonly name = 'heart-of-rak';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured() || window.city.toLowerCase() !== 'ras al khaimah') return [];

    try {
      const events = new Map<string, NormalizedEvent>();
      let after: string | null = null;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const response: { data: GraphqlEventsResponse } = await http.post<GraphqlEventsResponse>(GRAPHQL_URL, {
          query: EVENTS_QUERY,
          variables: { after },
        }, {
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://heartofrak.com',
            Referer: CALENDAR_URL,
          },
        });
        const connection: GraphqlEventsConnection | undefined = response.data?.data?.events;
        for (const item of connection?.nodes || []) {
          const event = this.normalize(item);
          if (event && !events.has(event.externalId)) events.set(event.externalId, event);
        }
        const pageInfo: GraphqlEventsConnection['pageInfo'] = connection?.pageInfo;
        if (!pageInfo?.hasNextPage || !pageInfo.endCursor || pageInfo.endCursor === after) break;
        after = pageInfo.endCursor;
      }
      return [...events.values()];
    } catch (error: any) {
      logger.error('Heart of RAK provider failed', { error: error.message });
      return [];
    }
  }

  private normalize(item: HeartOfRakEvent): NormalizedEvent | undefined {
    const title = cleanTitle(stripHtml(item.title || ''));
    const startDate = gulfDate(item.eventDetails?.startDate);
    const parsedEndDate = gulfDate(item.eventDetails?.endDate);
    const endDate = parsedEndDate && startDate && parsedEndDate > startDate ? parsedEndDate : undefined;
    const externalId = item.databaseId === undefined ? '' : String(item.databaseId);
    if (
      !externalId
      || !title
      || !startDate
      || (endDate && endDate.getTime() < Date.now())
      || !validDateRange(startDate, endDate)
    ) {
      return undefined;
    }

    const kinds = (item.kinds?.nodes || [])
      .map(kind => kind.name?.trim())
      .filter((kind): kind is string => Boolean(kind));
    const tags = [...new Set([...kinds, 'RAK'])];

    return {
      externalId,
      externalSource: this.name,
      title,
      description: cleanDescription(item.content || item.excerpt),
      startDate,
      endDate,
      venueName: 'Ras Al Khaimah',
      address: 'Ras Al Khaimah',
      city: 'Ras Al Khaimah',
      country: 'United Arab Emirates',
      latitude: 25.7895,
      longitude: 55.9432,
      coverImage: item.featuredImage?.node?.sourceUrl,
      externalUrl: item.eventDetails?.eventLink || CALENDAR_URL,
      isFree: /free/i.test(item.eventDetails?.eventType || ''),
      category: kinds[0] || 'Community',
      tags,
    };
  }
}

export const heartOfRakProvider = new HeartOfRakProvider();
export default heartOfRakProvider;
