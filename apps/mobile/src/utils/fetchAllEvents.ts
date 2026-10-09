import { Event } from '@migo/shared';
import { api } from '../services/api';

export async function fetchAllEvents(
  params: Record<string, unknown>,
  maxPages = 10,
): Promise<Event[]> {
  const events: Event[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await api.get('/events', {
      params: { ...params, limit: 200, page },
    });
    const data = response.data?.data;
    const pageEvents = data?.events || data;

    if (!Array.isArray(pageEvents)) break;
    events.push(...pageEvents);

    if (data?.pagination?.hasNext !== true) break;
  }

  return events;
}
