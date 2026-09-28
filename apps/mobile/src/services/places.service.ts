import { api } from './api';

export interface Place {
  id: string;
  title: string;
  category: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  mapsUrl: string | null;
  thumbnail: string | null;
  rating: number | null;
  reviewCount: number | null;
  instagram: string | null;
  distanceKm?: number | null;
}

export type PlaceSearchStatus = 'ready' | 'pending' | 'failed';

export interface PlaceSearchResponse {
  status: PlaceSearchStatus;
  searchId: string;
  places: Place[];
  retryAfterSeconds?: number;
  message?: string;
  cachedAt?: string | null;
  locationLabel?: string | null;
  latitude?: number;
  longitude?: number;
}

export interface PlaceDetail extends Place {
  country: string | null;
  priceRange: string | null;
  events: Array<{
    id: string;
    title: string;
    startDate: string;
    coverImage: string | null;
    priceFrom: number | null;
    currency: string;
    isFree: boolean;
  }>;
}

export interface PlaceSearchInput {
  keyword: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  radiusKm?: number;
}

export const placesService = {
  /**
   * Starts a search. Results are usually cached and come back immediately;
   * a cache miss returns status 'pending' and must be polled.
   */
  async search(input: PlaceSearchInput): Promise<PlaceSearchResponse> {
    try {
      const response = await api.post<{ success: boolean; data: PlaceSearchResponse }>(
        '/places/search',
        input
      );
      return response.data.data;
    } catch (error: any) {
      const status = error.response?.status;
      if (status === 429) {
        throw new Error(
          error.response?.data?.message || 'Too many searches for now — try again shortly.'
        );
      }
      throw new Error(error.response?.data?.message || 'Search failed. Please try again.');
    }
  },

  /** Polls a pending search. */
  async poll(
    searchId: string,
    origin?: { latitude: number; longitude: number }
  ): Promise<PlaceSearchResponse> {
    const params = origin ? { lat: origin.latitude, lng: origin.longitude } : undefined;
    const response = await api.get<{ success: boolean; data: PlaceSearchResponse }>(
      `/places/search/${searchId}`,
      { params }
    );
    return response.data.data;
  },

  /** Instant, cache-only lookup around a coordinate. Never triggers a scrape. */
  async nearby(opts: {
    latitude: number;
    longitude: number;
    q?: string;
    radiusKm?: number;
    limit?: number;
  }): Promise<{ places: Place[]; locationLabel: string | null }> {
    const response = await api.get<{
      success: boolean;
      data: { places: Place[]; locationLabel: string | null };
    }>('/places/nearby', {
      params: {
        lat: opts.latitude,
        lng: opts.longitude,
        q: opts.q,
        radiusKm: opts.radiusKm,
        limit: opts.limit,
      },
    });
    return response.data.data;
  },

  async getById(
    id: string,
    origin?: { latitude: number; longitude: number }
  ): Promise<PlaceDetail> {
    const params = origin ? { lat: origin.latitude, lng: origin.longitude } : undefined;
    const response = await api.get<{ success: boolean; data: PlaceDetail }>(`/places/${id}`, {
      params,
    });
    return response.data.data;
  },
};

/**
 * Polls a pending search until it resolves or the timeout passes.
 * Calls `onUpdate` with each intermediate state so the UI can show progress.
 */
export async function awaitSearch(
  searchId: string,
  opts: {
    origin?: { latitude: number; longitude: number };
    timeoutMs?: number;
    onUpdate?: (result: PlaceSearchResponse) => void;
    signal?: { cancelled: boolean };
  } = {}
): Promise<PlaceSearchResponse> {
  const timeout = opts.timeoutMs ?? 3 * 60_000;
  const deadline = Date.now() + timeout;

  let result = await placesService.poll(searchId, opts.origin);
  opts.onUpdate?.(result);

  while (result.status === 'pending' && Date.now() < deadline) {
    if (opts.signal?.cancelled) return result;
    const wait = Math.max(5, result.retryAfterSeconds ?? 12) * 1000;
    await new Promise((resolve) => setTimeout(resolve, wait));
    if (opts.signal?.cancelled) return result;

    result = await placesService.poll(searchId, opts.origin);
    opts.onUpdate?.(result);
  }

  return result;
}
