import crypto from 'crypto';
import * as cheerio from 'cheerio';
import config from '../../config/env';
import logger from '../../utils/logger';
import { cleanTitle, http, isDiscoveryProviderDisabled, parseDubaiDate, validDateRange } from './http';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

const emirates: Record<string, string> = {
  'Abu Dhabi': '185B3A13-8F28-4886-9534-8B35D5AA41FA',
  Dubai: 'E6D03F8F-7DEF-461C-ABF0-C86691FBFBAE',
  Sharjah: 'B4545384-AB35-4570-ABB1-8BDAD7B02CF2',
  Ajman: '05BECE42-66A9-445F-8517-11BB08118021',
  'Umm Al Quwain': '4D4342B1-338D-404D-9584-17B2D2693697',
  'Ras Al Khaimah': '381F9CF0-55D6-4A29-9404-3542C0E209C0',
  Fujairah: 'C5BE00DB-03ED-463C-ADB4-AA16B4AA77D1',
};
const contextId = 'FC92EB2C-D70A-4218-8BD1-D27EE19D3783';

class UaeGovProvider implements EventProvider {
  readonly name = 'uae-gov';

  isConfigured(): boolean {
    return !isDiscoveryProviderDisabled(this.name);
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    const firstCity = config.SYNC_CITIES[0]?.toLowerCase();
    if (!this.isConfigured() || window.city.toLowerCase() !== firstCity) return [];
    const events: NormalizedEvent[] = [];
    const seen = new Set<string>();
    try {
      const today = new Date();
      for (const [emirate, emirateId] of Object.entries(emirates)) {
        for (let monthOffset = 0; monthOffset < config.UAE_GOV_MONTHS_AHEAD; monthOffset += 1) {
          const month = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
          try {
            const response = await http.post(
              'https://u.ae/Media/GetEventsListing',
              new URLSearchParams({
                searchText: '',
                categoryID: '',
                emirateID: `{${emirateId}}`,
                eventDate: month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                ContextID: `{${contextId}}`,
                lang: 'en',
                'pagingDTO.CurrentPageNumber': '1',
                'pagingDTO.PageCount': '50',
                'pagingDTO.IsFilterUpdated': 'true',
              }).toString(),
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'X-Requested-With': 'XMLHttpRequest',
                  Referer: 'https://u.ae/en/media/events',
                },
                timeout: 30_000,
              },
            );
            const html = response.data?.pv;
            if (!html) continue;
            const $ = cheerio.load(html);
            $('section.custom-card').each((_index, element) => {
              const root = $(element);
              const title = cleanTitle(root.find('.card-text').text());
              const day = root.find('.star-card-date .day').text().trim();
              const monthName = root.find('.star-card-date .month').text().trim();
              const time = root.find('.card-container .card-date').text().replace(/\s+/g, ' ').trim();
              if (!title || !day || !monthName) return;
              const dateText = `${day} ${monthName} ${month.getFullYear()}`;
              const times = time.split(/\s+-\s+/);
              const allDay = times[0] === '12:00 AM' && times[1] === '12:00 AM';
              const startDate = parseDubaiDate(dateText, allDay ? '09:00 AM' : times[0]);
              const endDate = allDay ? undefined : times[1] ? parseDubaiDate(dateText, times[1]) : undefined;
              if (!validDateRange(startDate, endDate)) return;
              const externalId = crypto.createHash('sha1')
                .update(`${title}|${startDate.toISOString().slice(0, 10)}|${emirate}`)
                .digest('hex');
              if (seen.has(externalId)) return;
              seen.add(externalId);
              events.push({
                externalId,
                externalSource: this.name,
                title,
                startDate,
                endDate,
                venueName: emirate,
                address: emirate,
                city: emirate,
                country: 'United Arab Emirates',
                coverImage: root.find('.event-media img').attr('src'),
                externalUrl: root.find('.card-container a[href]').attr('href'),
                category: 'Government & Business',
              });
            });
          } catch (error: any) {
            logger.warn('UAE government event cell failed', { emirate, month: month.toISOString(), error: error.message });
          }
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      return events;
    } catch (error: any) {
      logger.error('UAE government provider failed', { error: error.message });
      return [];
    }
  }
}

export const uaeGovProvider = new UaeGovProvider();
export default uaeGovProvider;
