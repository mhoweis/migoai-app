import config from '../../config/env';
import logger from '../../utils/logger';
import { cleanDescription, cleanTitle, http, isDiscoveryProviderDisabled, numberValue, validDateRange } from './http';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

class VisitAbuDhabiProvider implements EventProvider {
  readonly name = 'visit-abu-dhabi';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured() || window.city.toLowerCase() !== 'abu dhabi') return [];
    try {
      const events: NormalizedEvent[] = [];
      const today = new Date();
      const end = new Date(today);
      end.setMonth(end.getMonth() + 18);
      const body = {
        contentType: 'Event',
        language: 'en',
        facetFields: [],
        limit: 100,
        filters: [],
        startDate: this.formatDate(today),
        endDate: this.formatDate(end),
      };
      for (let offset = 0; ; offset += 100) {
        const response = await http.post('https://scapim.dct.gov.ae/prod-vad/search/v1', { ...body, offset }, {
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://visitabudhabi.ae',
            Referer: 'https://visitabudhabi.ae/en/events',
          },
        });
        const data = response.data?.data;
        const results = data?.results || [];
        events.push(...results.flatMap((item: any) => this.normalize(item)));
        if (!results.length || offset + results.length >= Number(data?.totalResults || 0)) break;
      }
      return events;
    } catch (error: any) {
      logger.error('Visit Abu Dhabi provider failed', { error: error.message });
      return [];
    }
  }

  private normalize(item: any): NormalizedEvent[] {
    const title = cleanTitle(item.name);
    const startDate = new Date(item.startDate);
    const endDate = item.endDate ? new Date(item.endDate) : undefined;
    if (!title || !validDateRange(startDate, endDate)) return [];
    const image = item.thumbnailImage?.['16x9-card']?.large || item.thumbnailImage?.src;
    const priceFrom = numberValue(item.ticket_price?.[0]);
    return [{
      externalId: String(item.itemUniqueKey),
      externalSource: this.name,
      title,
      description: cleanDescription(item.description),
      startDate,
      endDate,
      venueName: item.location_Titles?.[0],
      address: item.location_Titles?.[0],
      city: 'Abu Dhabi',
      country: 'United Arab Emirates',
      latitude: numberValue(item.latitude),
      longitude: numberValue(item.longitude),
      coverImage: image ? `https://visitabudhabi.ae${image}` : undefined,
      externalUrl: item.externalUrl || item.ticket_webURLs?.[0]
        || `https://visitabudhabi.ae${item.itemUrl || '/en'}`,
      isFree: !item.isPaid,
      priceFrom,
      currency: priceFrom !== undefined ? 'AED' : undefined,
      category: item.eventCategories?.[0],
      tags: item.eventCategories,
    }];
  }

  private formatDate(value: Date): string {
    return `${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}-${value.getFullYear()}`;
  }
}

export const visitAbuDhabiProvider = new VisitAbuDhabiProvider();
export default visitAbuDhabiProvider;
