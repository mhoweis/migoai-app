import config from '../../config/env';
import logger from '../../utils/logger';
import { cleanDescription, cleanTitle, http, isDiscoveryProviderDisabled, validDateRange } from './http';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

const places: Record<string, string> = { dubai: 'discplace-d3kg1aLIJ5ROF6S' };

class LumaProvider implements EventProvider {
  readonly name = 'luma';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    const place = places[window.city.toLowerCase()];
    if (!this.isConfigured() || !place) return [];
    try {
      const events: NormalizedEvent[] = [];
      let cursor: string | undefined;
      do {
        const response = await http.get('https://api.lu.ma/discover/get-paginated-events', {
          params: { discover_place_api_id: place, pagination_limit: 50, ...(cursor ? { pagination_cursor: cursor } : {}) },
        });
        const page = response.data || {};
        events.push(...(page.entries || []).flatMap((entry: any) => this.normalize(entry, window.city)));
        cursor = page.has_more ? page.next_cursor : undefined;
      } while (cursor);
      return events;
    } catch (error: any) {
      logger.error('Luma provider failed', { error: error.message });
      return [];
    }
  }

  private normalize(entry: any, city: string): NormalizedEvent[] {
    const event = entry.event || {};
    const title = cleanTitle(event.name);
    const startDate = new Date(event.start_at);
    const endDate = event.end_at ? new Date(event.end_at) : undefined;
    if (!title || !validDateRange(startDate, endDate)) return [];
    const address = event.geo_address_info;
    const ticket = entry.ticket_info || {};
    const eventUrl = event.url?.startsWith('http') ? event.url : `https://lu.ma/${event.url || ''}`;
    return [{
      externalId: String(event.api_id),
      externalSource: this.name,
      title,
      description: cleanDescription(entry.calendar?.description_short || ''),
      startDate,
      endDate,
      venueName: event.location_type === 'online' ? 'Online' : address?.address,
      address: address?.full_address,
      city,
      country: 'United Arab Emirates',
      latitude: event.coordinate?.latitude,
      longitude: event.coordinate?.longitude,
      coverImage: event.cover_url,
      externalUrl: eventUrl,
      isFree: ticket.is_free,
      priceFrom: ticket.price?.cents !== undefined ? ticket.price.cents / 100 : undefined,
      priceTo: ticket.max_price?.cents !== undefined ? ticket.max_price.cents / 100 : undefined,
      currency: ticket.price?.currency?.toUpperCase(),
      category: 'Community',
      tags: ticket.is_sold_out ? ['sold-out'] : [],
    }];
  }
}

export const lumaProvider = new LumaProvider();
export default lumaProvider;
