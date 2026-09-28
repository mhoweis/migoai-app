export interface NormalizedEvent {
  externalId: string;
  externalSource: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  venueName?: string;
  address?: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
  coverImage?: string;
  priceFrom?: number;
  priceTo?: number;
  currency?: string;
  isFree?: boolean;
  category?: string;
  externalUrl?: string;
  tags?: string[];
}

export interface SyncWindow {
  updatedSince?: Date;
  city: string;
}

export interface EventProvider {
  readonly name: string;
  isConfigured(): boolean;
  fetchEvents(window: SyncWindow): Promise<NormalizedEvent[]>;
}
