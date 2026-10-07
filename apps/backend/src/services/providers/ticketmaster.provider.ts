import axios from 'axios';
import config from '../../config/env';
import logger from '../../utils/logger';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

const endpoint = 'https://app.ticketmaster.com/discovery/v2/events.json';

const withoutMilliseconds = (date: Date): string =>
  date.toISOString().replace(/\.\d{3}Z$/, 'Z');

const wait = (milliseconds: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

class TicketmasterProvider implements EventProvider {
  readonly name = 'ticketmaster';

  isConfigured(): boolean {
    return Boolean(config.TICKETMASTER_API_KEY);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const events: NormalizedEvent[] = [];
    let retry429 = false;

    for (let page = 0; page < config.TICKETMASTER_MAX_PAGES; page += 1) {
      try {
        const response = await axios.get(endpoint, {
          params: {
            apikey: config.TICKETMASTER_API_KEY,
            city: window.city,
            countryCode: 'AE',
            size: 200,
            sort: 'date,asc',
            startDateTime: withoutMilliseconds(new Date()),
            page,
          },
          timeout: 15000,
        });
        const pageEvents = response.data?._embedded?.events || [];
        events.push(...pageEvents.map((event: any) => this.normalize(event, window.city)));
        if (pageEvents.length === 0 || page >= (response.data?.page?.totalPages || 1) - 1) {
          break;
        }
      } catch (error: any) {
        if (error.response?.status === 429 && !retry429) {
          retry429 = true;
          await wait(2000);
          page -= 1;
          continue;
        }
        logger.error('Ticketmaster event fetch failed', {
          city: window.city,
          page,
          error: error.message,
        });
        break;
      }
    }

    return events;
  }

  private normalize(event: any, city: string): NormalizedEvent {
    const venue = event._embedded?.venues?.[0];
    const images = (event.images || []).filter((image: any) => image.ratio === '16_9');
    const image = [...images].sort((left, right) => (right.width || 0) - (left.width || 0))[0]
      || [...(event.images || [])].sort((left, right) => (right.width || 0) - (left.width || 0))[0];
    const classification = event.classifications?.[0];
    const price = event.priceRanges?.[0];
    const start = event.dates?.start?.dateTime || event.dates?.start?.localDate;
    const end = event.dates?.end?.dateTime || event.dates?.end?.localDate;

    return {
      externalId: String(event.id),
      externalSource: this.name,
      title: event.name || 'Untitled event',
      description: event.description || event.pleaseNote,
      startDate: new Date(start),
      endDate: end ? new Date(end) : undefined,
      venueName: venue?.name,
      address: [venue?.address?.line1, venue?.city?.name, venue?.state?.name]
        .filter(Boolean)
        .join(', ') || undefined,
      city: venue?.city?.name || city,
      country: venue?.country?.countryCode || venue?.country?.name || 'AE',
      latitude: venue?.location?.latitude ? Number(venue.location.latitude) : undefined,
      longitude: venue?.location?.longitude ? Number(venue.location.longitude) : undefined,
      coverImage: image?.url,
      priceFrom: price?.min,
      priceTo: price?.max,
      currency: price?.currency,
      isFree: !price,
      category: classification?.segment?.name || classification?.genre?.name,
      externalUrl: event.url,
      tags: [
        classification?.segment?.name,
        classification?.genre?.name,
        classification?.subGenre?.name,
      ].filter(Boolean),
    };
  }
}

export const ticketmasterProvider = new TicketmasterProvider();
export default ticketmasterProvider;
