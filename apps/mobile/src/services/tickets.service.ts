import { api } from './api';

export interface Ticket {
  id: string;
  totalAmount?: number | string | null;
  currency?: string | null;
  qrCode?: string;
  ticketCount: number;
  status: 'CONFIRMED' | 'CHECKED_IN' | string;
  attendeeName?: string;
  attendeeEmail?: string;
  checkedInAt?: string | null;
  pendingTransfer?: {
    id: string;
    toEmail: string;
    expiresAt: string;
  };
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

export interface PassCapabilities {
  apple: boolean;
  google: boolean;
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
  invited: number;
}

export const ticketsService = {
  async rsvp(eventId: string, ticketCount = 1, inviteCode?: string): Promise<Ticket> {
    const response = await api.post<{ success: boolean; data: Ticket }>('/bookings', {
      eventId,
      ticketCount,
      inviteCode,
    });
    return response.data.data;
  },

  async checkout(
    eventId: string,
    ticketCount: number,
    returnUrl: string,
    inviteCode?: string,
  ): Promise<{ bookingId: string; checkoutUrl: string; provider: string }> {
    const response = await api.post<{
      success: boolean;
      data: { bookingId: string; checkoutUrl: string; provider: string };
    }>('/bookings/checkout', { eventId, ticketCount, returnUrl, inviteCode });
    return response.data.data;
  },

  async confirm(bookingId: string): Promise<{ status: 'PENDING' | 'CONFIRMED'; booking?: Ticket }> {
    const response = await api.post<{ success: boolean; data: Ticket | { status: 'PENDING' } }>(
      `/bookings/${bookingId}/confirm`,
    );
    const data = response.data.data;
    return 'status' in data && data.status === 'PENDING'
      ? { status: 'PENDING' }
      : { status: 'CONFIRMED', booking: data as Ticket };
  },

  async myTickets(): Promise<Ticket[]> {
    const response = await api.get<{ success: boolean; data: Ticket[] }>('/bookings/me');
    return response.data.data || [];
  },

  async passesConfig(): Promise<PassCapabilities> {
    const response = await api.get<{ success: boolean; data: PassCapabilities }>('/bookings/passes/config');
    return response.data.data;
  },

  async googlePassUrl(id: string): Promise<string> {
    const response = await api.get<{ success: boolean; data: { saveUrl: string } }>(`/bookings/${id}/pass/google`);
    return response.data.data.saveUrl;
  },

  applePassUrl(id: string): string {
    return `/api/bookings/${id}/pass/apple`;
  },

  async transfer(id: string, toEmail: string): Promise<{
    id: string;
    code: string;
    toEmail: string;
    expiresAt: string;
    claimUrl: string;
    whatsappUrl: string;
  }> {
    const response = await api.post('/bookings/' + id + '/transfer', { toEmail });
    return response.data.data;
  },

  async cancelTransfer(id: string): Promise<void> {
    await api.delete(`/bookings/transfers/${id}`);
  },

  async getTransfer(code: string): Promise<{
    eventTitle: string;
    startDate: string;
    venue: string;
    fromName?: string | null;
    status: string;
    expiresAt: string;
    canAccept: boolean;
  }> {
    const response = await api.get(`/bookings/transfers/${encodeURIComponent(code)}`);
    return response.data.data;
  },

  async acceptTransfer(code: string): Promise<Ticket> {
    const response = await api.post(`/bookings/transfers/${encodeURIComponent(code)}/accept`);
    return response.data.data;
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
