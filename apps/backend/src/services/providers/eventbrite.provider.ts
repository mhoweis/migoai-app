import axios from 'axios';
import config from '../../config/env';
import logger from '../../utils/logger';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

class EventbriteProvider implements EventProvider {
  readonly name = 'eventbrite';

  isConfigured(): boolean {
    return Boolean(config.EVENTBRITE_PRIVATE_TOKEN && config.EVENTBRITE_ORGANIZATION_IDS.length);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const events: NormalizedEvent[] = [];
    for (const organizationId of config.EVENTBRITE_ORGANIZATION_IDS) {
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        try {
          const response = await axios.get(
            `https://www.eventbriteapi.com/v3/organizations/${encodeURIComponent(organizationId)}/events/`,
            {
              headers: { Authorization: `Bearer ${config.EVENTBRITE_PRIVATE_TOKEN}` },
              params: {
                status: 'live',
                time_filter: 'current_future',
                expand: 'venue,ticket_availability,category',
                page,
              },
              timeout: 15000,
            },
          );
          const pageEvents = response.data?.events || [];
          events.push(...pageEvents.map((event: any) => this.normalize(event, window.city)));
          hasMore = Boolean(response.data?.pagination?.has_more_items);
          page += 1;
        } catch (error: any) {
          logger.error('Eventbrite event fetch failed', {
            organizationId,
            page,
            error: error.message,
          });
          break;
        }
      }
    }

    return events;
  }

  private normalize(event: any, city: string): NormalizedEvent {
    const venue = event.venue || {};
    const address = venue.address || {};
    const ticketAvailability = event.ticket_availability || {};
    const minimum = ticketAvailability.minimum_ticket_price?.major_value;
    const maximum = ticketAvailability.maximum_ticket_price?.major_value;
    const start = event.start?.utc || event.start?.local;
    const end = event.end?.utc || event.end?.local;

    return {
      externalId: String(event.id),
      externalSource: this.name,
      title: event.name?.text || 'Untitled event',
      description: event.description?.text || event.summary,
      startDate: new Date(start),
      endDate: end ? new Date(end) : undefined,
      venueName: venue.name,
      address: address.localized_address_display || address.address_1,
      city: address.city || city,
      country: address.country || 'AE',
      latitude: venue.latitude ? Number(venue.latitude) : undefined,
      longitude: venue.longitude ? Number(venue.longitude) : undefined,
      coverImage: event.logo?.original?.url,
      priceFrom: minimum !== undefined ? Number(minimum) : undefined,
      priceTo: maximum !== undefined ? Number(maximum) : undefined,
      currency: ticketAvailability.minimum_ticket_price?.currency,
      isFree: Boolean(event.is_free),
      category: event.category?.name,
      externalUrl: event.url,
    };
  }
}

export const eventbriteProvider = new EventbriteProvider();
export default eventbriteProvider;
