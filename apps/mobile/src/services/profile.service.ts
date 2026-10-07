import { api } from './api';
import type { Event } from '@migo/shared';

export type ProfileCounts = {
  followers: number;
  following: number;
  upcoming: number;
  past: number;
  attended: number;
  hosted: number;
  reviews: number;
};

export type PublicProfile = {
  user: {
    id: string;
    name: string;
    avatar: string | null;
    coverImage: string | null;
    bio: string | null;
    isPrivate: boolean;
    role: 'USER' | 'ORGANIZER' | 'SUPPLIER' | 'ADMIN';
    createdAt: string;
  };
  counts: ProfileCounts;
  isMe: boolean;
  isFollowing: boolean;
  followRequested: boolean;
  followsYou: boolean;
  canViewContent: boolean;
  pendingRequests?: number;
};

export type ConnectionProfile = {
  id: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  isFollowing: boolean;
  followRequested?: boolean;
  isMe: boolean;
  isPrivate?: boolean;
};

export type FollowRequestProfile = ConnectionProfile & { createdAt: string };

export type ProfileEvent = Event & { relation: 'hosting' | 'going' | 'attended' };

export type ReviewUser = { id: string; name: string; avatar: string | null };
export type ReviewSummary = {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  createdAt: string;
  user?: ReviewUser;
  event?: { id: string; title: string; coverImage: string | null; startDate: string; venueName: string | null };
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  canInteract: boolean;
  isMine?: boolean;
};

export type ReviewComment = {
  id: string;
  body: string;
  createdAt: string;
  user: ReviewUser;
  canDelete: boolean;
};

const data = <T>(response: { data: { data: T } }): T => response.data.data;

export const profileService = {
  async profile(userId: string): Promise<PublicProfile> {
    return data(await api.get(`/users/${encodeURIComponent(userId)}/profile`));
  },

  async connections(
    userId: string,
    type: 'followers' | 'following',
    page = 1,
    pageSize = 50,
  ): Promise<{ items: ConnectionProfile[]; total: number }> {
    return data(await api.get(`/users/${encodeURIComponent(userId)}/${type}`, { params: { page, pageSize } }));
  },

  async followRequests(page = 1, pageSize = 50): Promise<{ items: FollowRequestProfile[]; total: number }> {
    return data(await api.get('/users/me/follow-requests', { params: { page, pageSize } }));
  },

  async approveFollowRequest(userId: string): Promise<void> {
    await api.post(`/users/me/follow-requests/${encodeURIComponent(userId)}/approve`);
  },

  async declineFollowRequest(userId: string): Promise<void> {
    await api.delete(`/users/me/follow-requests/${encodeURIComponent(userId)}`);
  },

  async events(
    userId: string,
    type: 'upcoming' | 'past' | 'attended' | 'hosted',
    page = 1,
  ): Promise<{ items: ProfileEvent[]; total: number }> {
    return data(await api.get(`/users/${encodeURIComponent(userId)}/events`, { params: { type, page, pageSize: 20 } }));
  },

  async reviews(userId: string, page = 1): Promise<{ items: ReviewSummary[]; total: number }> {
    return data(await api.get(`/users/${encodeURIComponent(userId)}/reviews`, { params: { page, pageSize: 20 } }));
  },

  async eventReviews(eventId: string, pageSize = 5, page = 1): Promise<{ items: ReviewSummary[]; total: number }> {
    return data(await api.get(`/events/${encodeURIComponent(eventId)}/reviews`, { params: { page, pageSize } }));
  },

  async submitReview(
    eventId: string,
    input: { rating: number; title?: string; comment?: string },
  ): Promise<ReviewSummary> {
    return data(await api.post(`/events/${encodeURIComponent(eventId)}/reviews`, input));
  },

  async likeReview(reviewId: string): Promise<{ likeCount: number; likedByMe: boolean }> {
    return data(await api.post(`/reviews/${encodeURIComponent(reviewId)}/like`));
  },

  async unlikeReview(reviewId: string): Promise<{ likeCount: number; likedByMe: boolean }> {
    return data(await api.delete(`/reviews/${encodeURIComponent(reviewId)}/like`));
  },

  async comments(reviewId: string): Promise<{ items: ReviewComment[]; total: number }> {
    return data(await api.get(`/reviews/${encodeURIComponent(reviewId)}/comments`, { params: { page: 1, pageSize: 50 } }));
  },

  async addComment(reviewId: string, body: string): Promise<ReviewComment> {
    return data(await api.post(`/reviews/${encodeURIComponent(reviewId)}/comments`, { body }));
  },

  async deleteComment(reviewId: string, commentId: string): Promise<void> {
    await api.delete(`/reviews/${encodeURIComponent(reviewId)}/comments/${encodeURIComponent(commentId)}`);
  },
};
