import { api } from './api';

export type HostDashboardEvent = {
  id: string;
  title: string;
  coverImage: string | null;
  startDate: string;
  endDate: string | null;
  status: string;
  venueName: string | null;
  capacity: number | null;
  registered: number;
  checkedIn: number;
  bookings: number;
  invited: number;
  saves: number;
  views: number;
  checkInRate: number;
  isPast: boolean;
};

export type HostDashboardData = {
  community: {
    followers: number;
    following: number;
    newFollowers30d: number;
    followerGrowth: { weekStart: string; newFollowers: number; total: number }[];
    recentFollowers: {
      id: string;
      name: string;
      avatar: string | null;
      followedAt: string;
      followsBack: boolean;
    }[];
    repeatAttendees: {
      id: string;
      name: string;
      avatar: string | null;
      eventsAttended: number;
    }[];
    followersAttending: number;
  };
  totals: {
    hosted: number;
    upcoming: number;
    past: number;
    registered: number;
    checkedIn: number;
    checkInRate: number | null;
    capacity: number;
    saves: number;
    views: number;
  };
  events: HostDashboardEvent[];
};

export const dashboardService = {
  async getHostDashboard(): Promise<HostDashboardData> {
    const response = await api.get('/users/me/dashboard');
    return response.data.data;
  },
};
