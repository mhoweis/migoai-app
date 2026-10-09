import { api } from './api';
import { Event } from '@migo/shared';

export interface SocialUser {
  id: string;
  name?: string | null;
  avatar?: string | null;
  isFollowing?: boolean;
  followRequested?: boolean;
  isPrivate?: boolean;
  goingCount?: number;
}

export interface EventSocial {
  goingCount: number;
  attendeesPreview: SocialUser[];
  friendsGoing: SocialUser[];
}

export interface InviteLinks {
  code: string;
  shareUrl: string;
  whatsappUrl: string;
}

const data = <T>(response: { data: { data: T } }): T => response.data.data;

export const socialService = {
  async invite(eventId: string, returnUrl?: string): Promise<InviteLinks> {
    return data(await api.post('/events/' + eventId + '/invite', returnUrl ? { returnUrl } : {}));
  },
  async social(eventId: string): Promise<EventSocial> {
    return data(await api.get(`/events/${eventId}/social`));
  },
  async searchUsers(q: string): Promise<SocialUser[]> {
    return data(await api.get('/users/search', { params: { q } }));
  },
  async follow(id: string): Promise<{ status: 'requested' | 'following' }> {
    return data(await api.post(`/users/${id}/follow`));
  },
  async unfollow(id: string): Promise<void> {
    await api.delete(`/users/${id}/follow`);
  },
  async following(): Promise<SocialUser[]> {
    return data(await api.get('/users/me/following'));
  },
  async suggested(): Promise<SocialUser[]> {
    return data(await api.get('/users/suggested'));
  },
  async friendsGoingEvents(limit = 10): Promise<Array<Event & { friendsGoing: SocialUser[]; friendsGoingCount: number }>> {
    const response = data<{ events: Array<Event & { friendsGoing: SocialUser[]; friendsGoingCount: number }> }>(
      await api.get('/events/friends-going', { params: { limit } }),
    );
    return response.events;
  },
};
