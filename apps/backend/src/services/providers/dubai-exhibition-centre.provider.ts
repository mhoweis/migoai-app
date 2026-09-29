import logger from '../../utils/logger';
import { absoluteUrl, cleanDescription, cleanTitle, http, isDiscoveryProviderDisabled, validDateRange } from './http';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

const GRAPHQL_URL = 'https://graphql.umbraco.io';
const GRAPHQL_QUERY = `
  query($culture: String, $first: Int, $after: String) {
    allDecEvent(culture: $culture, first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      items {
        id
        title
        name
        date
        endDate
        url
        category
        featuredImage { url cropUrl }
        location
        newEventVenue
        audience
        industry
      }
    }
  }
`;

class DubaiExhibitionCentreProvider implements EventProvider {
  readonly name = 'dubai-exhibition-centre';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured() || window.city.toLowerCase() !== 'dubai') return [];

    try {
      const events: NormalizedEvent[] = [];
      let after: string | null = null;

      for (let page = 0; page < 10; page += 1) {
        const response: any = await http.post(
          GRAPHQL_URL,
          {
            query: GRAPHQL_QUERY,
            variables: { culture: 'en-US', first: 100, after },
          },
          {
            headers: {
              'umb-project-alias': 'dwtc',
              'Content-Type': 'application/json',
              Origin: 'https://www.dubaiexhibitioncentre.com',
              Referer: 'https://www.dubaiexhibitioncentre.com/en/whats-on',
            },
          },
        );
        const connection: any = response.data?.data?.allDecEvent;
        if (!Array.isArray(connection?.items)) break;

        for (const item of connection.items) {
          const normalized = this.normalize(item);
          if (normalized) events.push(normalized);
        }

        if (!connection.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
        after = connection.pageInfo.endCursor;
      }

      return [...new Map(events.map(event => [event.externalId, event])).values()];
    } catch (error: any) {
      logger.error('Dubai Exhibition Centre provider failed', { error: error.message });
      return [];
    }
  }

  private normalize(item: any): NormalizedEvent | undefined {
    const title = cleanTitle(item.name) || cleanTitle(item.title);
    const startDate = new Date(item.date);
    const endDate = item.endDate ? new Date(item.endDate) : undefined;
    if (!title || !validDateRange(startDate, endDate)) return undefined;

    const categories = this.strings(item.category);
    const industries = this.strings(item.industry);
    const audience = typeof item.audience === 'string' ? item.audience : undefined;
    const location = this.strings(item.newEventVenue)[0] || cleanTitle(item.location);

    return {
      externalId: String(item.id),
      externalSource: this.name,
      title,
      description: cleanDescription(`${title} at Dubai Exhibition Centre, Expo City Dubai`),
      startDate,
      endDate,
      venueName: (location ? `Dubai Exhibition Centre – ${location}` : 'Dubai Exhibition Centre').slice(0, 255),
      address: 'Dubai Exhibition Centre, Expo City Dubai',
      city: 'Dubai',
      country: 'United Arab Emirates',
      coverImage: item.featuredImage?.url || item.featuredImage?.cropUrl,
      externalUrl: absoluteUrl('https://www.dubaiexhibitioncentre.com', item.url),
      category: categories[0]?.slice(0, 100),
      tags: [...categories, ...industries, ...(audience ? [audience] : [])],
    };
  }

  private strings(value: unknown): string[] {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    return values
      .map(item => typeof item === 'string' ? item : item?.name || item?.title)
      .filter(Boolean);
  }
}

export const dubaiExhibitionCentreProvider = new DubaiExhibitionCentreProvider();
export default dubaiExhibitionCentreProvider;
