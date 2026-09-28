import * as cheerio from 'cheerio';
import config from '../../config/env';
import logger from '../../utils/logger';
import {
  absoluteUrl,
  cleanDescription,
  cleanTitle,
  htmlHeaders,
  http,
  isDiscoveryProviderDisabled,
  parseDubaiDate,
  validDateRange,
} from './http';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

class ExpoCentreSharjahProvider implements EventProvider {
  readonly name = 'expo-centre-sharjah';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured() || window.city.toLowerCase() !== 'sharjah') return [];
    try {
      const [page, descriptions] = await Promise.all([
        http.get('https://expo-centre.ae/events/', { headers: htmlHeaders }),
        this.loadDescriptions(),
      ]);
      const $ = cheerio.load(page.data);
      const events: NormalizedEvent[] = [];
      $('.event_listing.status-publish').not('.status-expired').each((_index, element) => {
        try {
          const root = $(element);
          const postId = root.attr('class')?.match(/post-(\d+)/)?.[1];
          const title = cleanTitle(root.find('.wpem-event-title h3').text());
          const dates = this.parseDateRange(root.find('.wpem-event-date-time-text').text());
          if (!postId || !title || !dates || !validDateRange(dates.start, dates.end)) return;
          const style = root.find('.wpem-event-banner-img').attr('style') || '';
          const image = style.match(/url\(['"]?([^'")]+)['"]?\)/)?.[1];
          events.push({
            externalId: postId,
            externalSource: this.name,
            title,
            description: descriptions.get(Number(postId)),
            startDate: dates.start,
            endDate: dates.end,
            venueName: root.find('.wpem-event-location-text').text().trim(),
            address: 'Expo Centre Sharjah',
            city: 'Sharjah',
            country: 'United Arab Emirates',
            coverImage: image,
            externalUrl: absoluteUrl('https://expo-centre.ae', root.find('a.wpem-event-action-url').attr('href')),
            category: 'Exhibition',
          });
        } catch (error: any) {
          logger.warn('Expo Centre Sharjah event skipped', { error: error.message });
        }
      });
      return events;
    } catch (error: any) {
      logger.error('Expo Centre Sharjah provider failed', { error: error.message });
      return [];
    }
  }

  private async loadDescriptions(): Promise<Map<number, string | undefined>> {
    const map = new Map<number, string | undefined>();
    const response = await http.get('https://expo-centre.ae/wp-json/wp/v2/event_listing', {
      params: { per_page: 100, _fields: 'id,content' },
    });
    for (const item of response.data || []) {
      map.set(item.id, cleanDescription(item.content?.rendered));
    }
    return map;
  }

  private parseDateRange(value: string): { start: Date; end: Date } | undefined {
    const text = value.replace(/\s+/g, ' ').trim();
    const match = text.match(/^(.+?)\s+@\s+(.+?)\s+-\s+(.+?)\s+@\s+(.+)$/);
    if (match) {
      return { start: parseDubaiDate(match[1], match[2]), end: parseDubaiDate(match[3], match[4]) };
    }
    const single = text.match(/^(.+?)\s+@\s+(.+?)\s+-\s+(.+)$/);
    if (!single) return undefined;
    return { start: parseDubaiDate(single[1], single[2]), end: parseDubaiDate(single[1], single[3]) };
  }
}

export const expoCentreSharjahProvider = new ExpoCentreSharjahProvider();
export default expoCentreSharjahProvider;
