import * as cheerio from 'cheerio';
import logger from '../../utils/logger';
import {
  absoluteUrl,
  cleanTitle,
  htmlHeaders,
  http,
  isDiscoveryProviderDisabled,
  validDateRange,
} from './http';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

const SITE_URL = 'https://myalain.ae';
const EVENTS_URL = `${SITE_URL}/events/`;

class MyAlAinProvider implements EventProvider {
  readonly name = 'my-al-ain';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured() || window.city.toLowerCase() !== 'abu dhabi') return [];

    try {
      const response = await http.get<string>(EVENTS_URL, { headers: htmlHeaders });
      const $ = cheerio.load(response.data);
      const events = new Map<string, NormalizedEvent>();
      $('article.pl-card').each((_index, element) => {
        try {
          const card = $(element);
          const button = card.find('button.evrb').first();
          if (!button.length) return;

          const rawTitle = button.attr('data-t') || '';
          const startText = button.attr('data-s') || '';
          const endText = button.attr('data-e') || '';
          const detailsUrl = button.attr('data-u') || '';
          const title = cleanTitle(rawTitle);
          if (!title || !startText || !endText) return;

          const startDate = new Date(`${startText}T00:00:00+04:00`);
          const endDate = new Date(`${endText}T23:59:00+04:00`);
          if (!validDateRange(startDate, endDate)) return;

          const externalUrl = absoluteUrl(SITE_URL, detailsUrl);
          let detailHost = '';
          let externalId = '';
          if (externalUrl) {
            const detail = new URL(externalUrl);
            detailHost = detail.hostname;
            externalId = detail.pathname.split('/').filter(Boolean).pop() || '';
          }
          if (!externalId) {
            const slug = title.toLowerCase()
              .normalize('NFKD')
              .replace(/[^\p{L}\p{N}]+/gu, '-')
              .replace(/^-|-$/g, '');
            externalId = `${startText}-${slug}`;
          }

          const venueName = detailHost === 'www.adnecalain.ae' ? 'ADNEC Centre Al Ain' : 'Al Ain';
          const category = /concert|candlelight/i.test(title)
            ? 'Music'
            : /exhibition|show|expo/i.test(title)
              ? 'Exhibition'
              : 'Other';
          const event: NormalizedEvent = {
            externalId,
            externalSource: this.name,
            title,
            startDate,
            endDate,
            venueName,
            address: 'Al Ain, Abu Dhabi',
            city: 'Abu Dhabi',
            country: 'United Arab Emirates',
            latitude: 24.2075,
            longitude: 55.7447,
            coverImage: absoluteUrl(SITE_URL, card.find('img.pl-img').first().attr('src')),
            externalUrl,
            isFree: false,
            currency: 'AED',
            category,
            tags: ['Al Ain'],
          };
          if (!events.has(event.externalId)) events.set(event.externalId, event);
        } catch (error: any) {
          logger.warn('MyAlAin event skipped', { error: error.message });
        }
      });
      return [...events.values()];
    } catch (error: any) {
      logger.error('MyAlAin provider failed', { error: error.message });
      return [];
    }
  }
}

export const myAlAinProvider = new MyAlAinProvider();
export default myAlAinProvider;
