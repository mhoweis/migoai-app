import config from '../../config/env';
import logger from '../../utils/logger';
import { cleanDescription, cleanTitle, http, isDiscoveryProviderDisabled, parseDubaiDate, validDateRange } from './http';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

class VisitSharjahProvider implements EventProvider {
  readonly name = 'visit-sharjah';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured() || window.city.toLowerCase() !== 'sharjah') return [];
    try {
      const response = await http.post(
        'https://www.visitsharjah.com/umbraco/Surface/Ajax/LoadMoreEvent',
        'skipEvent=0&takeEvent=100&culture=en&doAction=EventList',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: 'https://www.visitsharjah.com/events/',
          },
        },
      );
      const outer = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      const payload = typeof outer === 'string' ? JSON.parse(outer) : outer;
      const fetched = payload?.events || [];
      const events = fetched.flatMap((item: any) => this.normalize(item));
      logger.info('Visit Sharjah event filtering', { fetched: fetched.length, kept: events.length });
      return events;
    } catch (error: any) {
      logger.error('Visit Sharjah provider failed', { error: error.message });
      return [];
    }
  }

  private normalize(item: any): NormalizedEvent[] {
    const title = cleanTitle(item.Title);
    const startDate = parseDubaiDate(item.EventStartDate?.split(' - ')[0] || '');
    if (!title || !validDateRange(startDate)) return [];
    const externalId = item.pageUrl?.split('/').filter(Boolean).pop();
    if (!externalId) return [];
    return [{
      externalId,
      externalSource: this.name,
      title,
      description: cleanDescription(item.Text),
      startDate,
      venueName: 'Sharjah',
      city: 'Sharjah',
      country: 'United Arab Emirates',
      coverImage: item.ImageUrl ? `https://www.visitsharjah.com${item.ImageUrl}` : undefined,
      externalUrl: item.pageUrl,
      category: 'Culture',
    }];
  }
}

export const visitSharjahProvider = new VisitSharjahProvider();
export default visitSharjahProvider;
