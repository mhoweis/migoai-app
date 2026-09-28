import * as cheerio from 'cheerio';
import config from '../../config/env';
import logger from '../../utils/logger';
import {
  absoluteUrl,
  cleanDescription,
  cleanTitle,
  http,
  isDiscoveryProviderDisabled,
  parseDubaiDate,
  validDateRange,
} from './http';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

class AbuDhabiFestivalProvider implements EventProvider {
  readonly name = 'abu-dhabi-festival';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured() || window.city.toLowerCase() !== 'abu dhabi') return [];
    try {
      const html = (await http.get('https://www.abudhabifestival.ae/programme-tickets')).data;
      const $ = cheerio.load(html);
      const events: NormalizedEvent[] = [];
      $('.programme.w-dyn-item').each((_index, element) => {
        try {
          const root = $(element);
          const title = cleanTitle(root.find('h3.programme-event-title').text());
          const venue = root.find('[fs-list-field="venue"]').text().trim();
          if (!title || !/(abu dhabi|emirates|uae|etihad arena)/i.test(venue)) return;
          const startText = root.find('[event-start-date]').text().trim();
          const endText = root.find('[event-end-date]').text().trim() || startText;
          const times = root.find('.programme-time div').text().trim().split(/\s+-\s+/);
          const hasTime = /\b(?:AM|PM)\b/i.test(times[0] || '');
          const startDate = parseDubaiDate(startText, hasTime ? times[0] : undefined);
          const endDate = parseDubaiDate(endText, hasTime && times[1] ? times[1] : undefined);
          if (!validDateRange(startDate, endDate)) return;
          const detail = root.find('a[href^="/events/"]').attr('href');
          const ticket = root.find('a.btn.fill.aqua[href]').filter((_i, link) =>
            !$(link).hasClass('w-condition-invisible')).first().attr('href');
          const invite = root.find('.invite-only').not('.w-condition-invisible').length > 0;
          const externalUrl = ticket || absoluteUrl('https://www.abudhabifestival.ae', detail);
          const tags = invite ? ['invite-only'] : [];
          events.push({
            externalId: detail?.split('/').filter(Boolean).pop() || title.toLowerCase().replace(/\W+/g, '-'),
            externalSource: this.name,
            title,
            description: cleanDescription(`${root.find('[fs-list-field="what"]').text().trim()} · ${venue}`),
            startDate,
            endDate,
            venueName: venue,
            address: 'Abu Dhabi, United Arab Emirates',
            city: 'Abu Dhabi',
            country: 'United Arab Emirates',
            coverImage: root.find('img.programme-image').attr('src'),
            externalUrl,
            category: root.find('[fs-list-field="category"]').text().trim() || 'Arts and Culture',
            tags,
          });
        } catch (error: any) {
          logger.warn('Abu Dhabi Festival event skipped', { error: error.message });
        }
      });
      return events;
    } catch (error: any) {
      logger.error('Abu Dhabi Festival provider failed', { error: error.message });
      return [];
    }
  }
}

export const abuDhabiFestivalProvider = new AbuDhabiFestivalProvider();
export default abuDhabiFestivalProvider;
