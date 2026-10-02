import * as cheerio from 'cheerio';
import logger from '../../utils/logger';
import {
  absoluteUrl,
  cleanTitle,
  htmlHeaders,
  http,
  isDiscoveryProviderDisabled,
  parseDubaiDate,
  validDateRange,
} from './http';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

const listingUrl = 'https://alserkal.online/events';

class AlserkalProvider implements EventProvider {
  readonly name = 'alserkal';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured() || window.city.toLowerCase() !== 'dubai') return [];

    try {
      const response = await http.get(listingUrl, { headers: htmlHeaders });
      const $ = cheerio.load(response.data);
      const seen = new Set<string>();
      const events: NormalizedEvent[] = [];

      $('.event-cms-item[data="event-item"]').each((_index, element) => {
        try {
          const root = $(element);
          const href = root.find('a.event-card').attr('href');
          const externalUrl = absoluteUrl(listingUrl, href);
          const externalId = externalUrl?.split('/').filter(Boolean).pop();
          const title = cleanTitle(root.find('.event-card-title').text());
          if (!externalId || !externalUrl || !title || seen.has(externalId)) return;

          const dateElements = root.find('.event-card-date');
          const startElement = root.find('.event-card-date[event-starts]').first();
          const endElement = root.find('.event-card-date[event-ends]').last();
          const startText = startElement.attr('event-starts') || dateElements.first().text().trim();
          const endText = endElement.attr('event-ends') || (
            dateElements.length > 2 ? dateElements.last().text().trim() : undefined
          );
          const startDate = parseDubaiDate(startText, '10:00 AM');
          const endDate = endText ? parseDubaiDate(endText, '10:00 PM') : undefined;
          if (!validDateRange(startDate, endDate)) return;

          const category = cleanTitle(root.find('.event-card-label').text()) || 'Arts & Culture';
          const venue = cleanTitle(root.find('.event-card-organizer').text());
          seen.add(externalId);
          events.push({
            externalId,
            externalSource: this.name,
            title,
            startDate,
            endDate,
            venueName: venue ? `Alserkal Avenue – ${venue}` : 'Alserkal Avenue',
            address: 'Alserkal Avenue, Al Quoz, Dubai',
            city: 'Dubai',
            country: 'United Arab Emirates',
            latitude: 25.1428,
            longitude: 55.2320,
            coverImage: absoluteUrl(listingUrl, root.find('img.event-card-img').attr('src')),
            externalUrl,
            category,
            tags: ['Alserkal Avenue', category],
          });
        } catch (error: any) {
          logger.warn('Alserkal event skipped', { error: error.message });
        }
      });
      return events;
    } catch (error: any) {
      logger.error('Alserkal provider failed', { error: error.message });
      return [];
    }
  }
}

export const alserkalProvider = new AlserkalProvider();
export default alserkalProvider;
