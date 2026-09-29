import { api } from './api';
import { useUserStore } from '../store/userStore';

type ClientSignalType = 'search' | 'view' | 'save' | 'unsave';

let searchTimer: ReturnType<typeof setTimeout> | null = null;
let lastSearchQuery = '';

export async function trackSignal(
  type: ClientSignalType,
  opts: { eventId?: string; query?: string } = {},
): Promise<void> {
  if (!useUserStore.getState().user) return;
  try {
    await api.post('/users/me/signals', {
      type,
      ...(opts.eventId ? { eventId: opts.eventId } : {}),
      ...(opts.query ? { context: { query: opts.query } } : {}),
    });
  } catch {}
}

export function trackSearch(query: string): void {
  const trimmed = query.trim();
  if (searchTimer) clearTimeout(searchTimer);
  if (trimmed.length < 3 || trimmed === lastSearchQuery) return;
  searchTimer = setTimeout(() => {
    lastSearchQuery = trimmed;
    void trackSignal('search', { query: trimmed });
  }, 800);
}
