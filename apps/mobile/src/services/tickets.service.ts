import { api } from './api';

export interface Ticket {
  id: string;
  qrCode?: string;
  ticketCount: number;
  status: 'CONFIRMED' | 'CHECKED_IN' | string;
  attendeeName?: string;
  attendeeEmail?: string;
  checkedInAt?: string | null;
  event: {
    id: string;
    title: string;
    startDate: string;
    endDate?: string | null;
    venueName?: string | null;
    city?: string | null;
    category?: string | null;
    coverImage?: string | null;
    priceFrom?: number | null;
    currency?: string | null;
    isFree?: boolean;
  };
}

export interface CreateEventPayload {
  title: string;
  description?: string;
  category: string;
  startDate: string;
  endDate?: string;
  venueName: string;
  address?: string;
  city: string;
  country: string;
  locationLat?: number;
  locationLng?: number;
  isFree: boolean;
  priceFrom?: number;
  priceTo?: number;
  currency?: string;
  ticketUrl?: string;
  capacity?: number;
  coverImage?: string;
}

export interface HostedEvent {
  id: string;
  title: string;
  startDate: string;
  city?: string;
  capacity?: number;
  confirmed: number;
  checkedIn: number;
}

export const ticketsService = {
  async rsvp(eventId: string, ticketCount = 1): Promise<Ticket> {
    const response = await api.post<{ success: boolean; data: Ticket }>('/bookings', {
      eventId,
      ticketCount,
    });
    return response.data.data;
  },

  async myTickets(): Promise<Ticket[]> {
    const response = await api.get<{ success: boolean; data: Ticket[] }>('/bookings/me');
    return response.data.data || [];
  },

  async cancelTicket(id: string): Promise<void> {
    await api.post(`/bookings/${id}/cancel`);
  },

  async checkIn(code: string): Promise<{
    booking: Ticket;
    attendee?: { name?: string | null; email?: string | null };
    eventTitle: string;
    ticketCount: number;
  }> {
    const response = await api.post('/bookings/check-in', { code });
    return response.data.data;
  },

  async myEvents(): Promise<HostedEvent[]> {
    const response = await api.get<{ success: boolean; data: HostedEvent[] }>('/events/mine');
    return response.data.data || [];
  },

  async createEvent(payload: CreateEventPayload): Promise<unknown> {
    const response = await api.post<{ success: boolean; data: unknown }>('/events', payload);
    return response.data.data;
  },

  async attendance(eventId: string): Promise<{ confirmed: number; checkedIn: number; capacity: number }> {
    const response = await api.get(`/bookings/events/${eventId}/attendance`);
    return response.data.data;
  },
};
