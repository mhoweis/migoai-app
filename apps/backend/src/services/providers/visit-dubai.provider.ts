import config from '../../config/env';
import logger from '../../utils/logger';
import { cleanDescription, cleanTitle, http, isDiscoveryProviderDisabled, validDateRange } from './http';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

const indexDefault = 'prod104_vd_en';
let discovered: { appId: string; apiKey: string } | undefined;

class VisitDubaiProvider implements EventProvider {
  readonly name = 'visit-dubai';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured() || window.city.toLowerCase() !== 'dubai') return [];
    try {
      const auth = await this.getCredentials();
      const results: any[] = [];
      let page = 0;
      let nbPages = 1;
      let useTimeFilter = true;
      while (page < nbPages) {
        const filters = useTimeFilter
          ? `archived:false AND hideinsearchpage:false AND eventDatesRange.to >= ${Math.floor(Date.now() / 1000)}`
          : 'archived:false AND hideinsearchpage:false';
        try {
          const response = await this.query(auth, page, filters);
          results.push(...(response.data?.hits || []));
          nbPages = response.data?.nbPages || page + 1;
          page += 1;
        } catch (error: any) {
          if (error.response?.status === 400 && useTimeFilter) {
            useTimeFilter = false;
            page = 0;
            results.length = 0;
            continue;
          }
          throw error;
        }
      }
      return results.flatMap(item => this.normalize(item));
    } catch (error: any) {
      logger.error('Visit Dubai provider failed', { error: error.message });
      if (error.response?.status === 401 || error.response?.status === 403) discovered = undefined;
      return [];
    }
  }

  private async getCredentials(): Promise<{ appId: string; apiKey: string }> {
    if (config.VISIT_DUBAI_ALGOLIA_APP_ID && config.VISIT_DUBAI_ALGOLIA_API_KEY) {
      return { appId: config.VISIT_DUBAI_ALGOLIA_APP_ID, apiKey: config.VISIT_DUBAI_ALGOLIA_API_KEY };
    }
    if (discovered) return discovered;
    const page = await http.get('https://www.visitdubai.com/en/festivals-and-events/dubai-events-calendar');
    const nextData = page.data.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (!nextData) throw new Error('Visit Dubai __NEXT_DATA__ not found');
    const json = JSON.parse(nextData);
    let appId: string | undefined;
    let apiKey: string | undefined;
    const visit = (value: any): void => {
      if (!value || appId && apiKey) return;
      if (typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          if (/algolia/i.test(key) && typeof child === 'string') {
            if (/^[A-Z0-9]{10}$/.test(child)) appId ||= child;
            if (/^[a-f0-9]{32}$/i.test(child)) apiKey ||= child;
          }
          visit(child);
        }
      }
    };
    visit(json);
    if (!appId || !apiKey) throw new Error('Visit Dubai Algolia credentials not found');
    discovered = { appId, apiKey };
    return discovered;
  }

  private query(auth: { appId: string; apiKey: string }, page: number, filters: string) {
    return http.post(
      `https://${auth.appId}-dsn.algolia.net/1/indexes/${config.VISIT_DUBAI_ALGOLIA_INDEX}/query`,
      {
        query: '',
        hitsPerPage: 200,
        page,
        facetFilters: [['type:Event']],
        filters,
        attributesToHighlight: [],
      },
      { headers: { 'X-Algolia-Application-Id': auth.appId, 'X-Algolia-API-Key': auth.apiKey } },
    );
  }

  private normalize(item: any): NormalizedEvent[] {
    const title = cleanTitle(Array.isArray(item.title) ? item.title[0] : item.title || item.englishTitle);
    const startDate = new Date(Number(item.eventDatesRange?.from) * 1000);
    const endDate = item.eventDatesRange?.to ? new Date(Number(item.eventDatesRange.to) * 1000) : undefined;
    if (!title || !validDateRange(startDate, endDate)) return [];
    return [{
      externalId: String(item.objectID),
      externalSource: this.name,
      title,
      description: cleanDescription(item.introText),
      startDate,
      endDate,
      venueName: item.address,
      address: item.address,
      city: 'Dubai',
      country: 'United Arab Emirates',
      latitude: item._geoloc?.lat,
      longitude: item._geoloc?.lng,
      coverImage: item.image?.startsWith('http') ? item.image : `https://www.visitdubai.com${item.image || ''}`,
      externalUrl: item.url,
      isFree: item.free,
      category: Array.isArray(item.category) ? item.category[0] : item.category,
      tags: Array.isArray(item.tags) ? item.tags : [],
    }];
  }
}

export const visitDubaiProvider = new VisitDubaiProvider();
export default visitDubaiProvider;
