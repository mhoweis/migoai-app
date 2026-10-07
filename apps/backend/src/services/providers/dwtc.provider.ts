import config from '../../config/env';
import logger from '../../utils/logger';
import { absoluteUrl, cleanDescription, cleanTitle, http, isDiscoveryProviderDisabled, validDateRange } from './http';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

let winningHash: string | undefined;

class DwtcProvider implements EventProvider {
  readonly name = 'dwtc';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured() || window.city.toLowerCase() !== 'dubai') return [];
    try {
      const hashes = winningHash ? [winningHash] : (await http.get(
        'https://www.dwtc.com/page-data/en/events/page-data.json',
      )).data?.staticQueryHashes || [];
      for (const hash of hashes) {
        const data = (await http.get(`https://www.dwtc.com/page-data/sq/d/${hash}.json`)).data;
        const items = data?.data?.umbraco?.allEvent?.items;
        if (!Array.isArray(items)) continue;
        winningHash = hash;
        return items.flatMap(item => this.normalize(item));
      }
      return [];
    } catch (error: any) {
      logger.error('DWTC provider failed', { error: error.message });
      return [];
    }
  }

  private normalize(item: any): NormalizedEvent[] {
    const title = cleanTitle(item.title);
    const startDate = new Date(item.startDate);
    const endDate = item.endDate ? new Date(item.endDate) : undefined;
    if (!title || !validDateRange(startDate, endDate)) return [];
    const tags = [...this.strings(item.eventSectors), ...this.strings(item.eventAudiences)];
    const category = (this.strings(item.eventSectors)[0] || this.strings(item.eventType)[0])?.slice(0, 100);
    const image = typeof item.featuredImage === 'string'
      ? item.featuredImage : item.featuredImage?.url || item.featuredImage?.src;
    return [{
      externalId: String(item.id),
      externalSource: this.name,
      title,
      description: cleanDescription(`${title} at Dubai World Trade Centre`),
      startDate,
      endDate,
      venueName: (this.strings(item.eventVenues).join(', ') || 'Dubai World Trade Centre').slice(0, 255),
      address: 'Dubai World Trade Centre',
      city: 'Dubai',
      country: 'United Arab Emirates',
      coverImage: image,
      externalUrl: absoluteUrl('https://www.dwtc.com', item.url),
      category,
      tags,
    }];
  }

  private strings(value: unknown): string[] {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    return values.map(item => typeof item === 'string' ? item : item?.name || item?.title).filter(Boolean);
  }
}

export const dwtcProvider = new DwtcProvider();
export default dwtcProvider;
