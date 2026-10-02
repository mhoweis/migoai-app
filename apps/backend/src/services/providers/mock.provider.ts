import config from '../../config/env';
import { EventProvider, NormalizedEvent, SyncWindow } from './types';

const events = [
  ['mock-1', 'Dubai Sunset Sessions', 'Music', false, 25],
  ['mock-2', 'Food Truck Festival', 'Food', true, 35],
  ['mock-3', 'Future Tech Dubai', 'Technology', false, 50],
  ['mock-4', 'Desert Sports Day', 'Sports', true, 65],
  ['mock-5', 'Alserkal Art Walk', 'Art', false, 80],
  ['mock-6', 'Mindful Morning Wellness', 'Wellness', true, 95],
] as const;

class MockProvider implements EventProvider {
  readonly name = 'mock';

  isConfigured(): boolean {
    return config.MOCK_EVENTS_PROVIDER === true;
  }

  async fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]> {
    if (!this.isConfigured() || window.city.toLowerCase() !== 'dubai') {
      return [];
    }

    const now = new Date();
    return events.map(([externalId, title, category, isFree, day]) => {
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() + (day === 95 ? 10 : Math.ceil(day / 10)));
      startDate.setHours(18, 0, 0, 0);
      const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
      return {
        externalId,
        externalSource: this.name,
        title,
        description: `${title} in Dubai`,
        startDate,
        endDate,
        venueName: 'Dubai Design District',
        address: 'Dubai, United Arab Emirates',
        city: 'Dubai',
        country: 'AE',
        latitude: 25.185,
        longitude: 55.296,
        coverImage: `https://images.unsplash.com/photo-${externalId.slice(5)}?auto=format&fit=crop&w=1200&q=80`,
        priceFrom: isFree ? undefined : 25,
        priceTo: isFree ? undefined : 95,
        currency: 'AED',
        isFree,
        category,
        externalUrl: isFree ? undefined : `https://migo.app/mock/${externalId}`,
        tags: [category, 'Dubai'],
      };
    });
  }
}

export const mockProvider = new MockProvider();
export default mockProvider;
