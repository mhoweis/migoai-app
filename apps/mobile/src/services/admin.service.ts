import { Platform, Share } from 'react-native';
import { api } from './api';

export type SupplierStatus = 'ACTIVE' | 'PROSPECT' | 'PAUSED';
export type CampaignStatus = 'PROPOSED' | 'ACTIVE' | 'ENDED' | 'CANCELLED';

export interface AnalyticsRange {
  from: string;
  to: string;
}

export interface SupplierMetrics {
  eventsListed: number;
  upcomingEvents: number;
  impressions: number;
  views: number;
  clicks: number;
  uniqueClickers: number;
  saves: number;
  bookings: number;
  tickets: number;
  revenueByCurrency: Record<string, number>;
  ctr: number;
  activeCampaigns: number;
}

export interface SupplierSummary extends SupplierMetrics {
  id: string;
  sourceKey: string;
  name: string;
  label: string;
  labelAr: string;
  kind: string;
  url: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  status: SupplierStatus;
  notes: string | null;
}

export interface DailyClicks {
  date: string;
  clicks: number;
  app: number;
  website: number;
  mobile_web: number;
  bookings: number;
}

export interface SupplierDetail extends SupplierSummary {
  range: AnalyticsRange;
  clicksByDay: DailyClicks[];
  clicksByPlatform: Record<'app' | 'website' | 'mobile_web', number>;
  clicksByPlacement: Array<{ placement: string; clicks: number }>;
  topEvents: Array<{
    id: string;
    title: string;
    startDate: string;
    views: number;
    clicks: number;
    saves: number;
    bookings: number;
    tickets: number;
  }>;
  upcomingEventOptions: Array<{ id: string; title: string; startDate: string }>;
  topSearchTerms: Array<{ query: string; count: number; uniqueUsers: number }>;
}

export interface SupplierPackage {
  key: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  priceAed: number;
  unit: string;
  effect: 'featured' | 'sponsored' | null;
}

export interface SupplierCampaign {
  id: string;
  supplierId: string;
  packageKey: string;
  eventId: string | null;
  startsAt: string;
  endsAt: string;
  priceAed: number | string;
  status: CampaignStatus;
  notes: string | null;
}

export interface SearchInsights {
  range: AnalyticsRange;
  topQueries: Array<{ query: string; count: number; uniqueUsers: number }>;
  trending: Array<{ query: string; count: number; previousCount: number; growthPercent: number }>;
  zeroResultQueries: Array<{ query: string; count: number; uniqueUsers: number }>;
  interestCategories: Array<{
    category: string;
    score: number;
    views: number;
    saves: number;
    clicks: number;
    bookings: number;
  }>;
  popularInterests: Array<{ interest: string; count: number }>;
  byEmirate: Array<{ emirate: string; views: number }>;
}

export interface SupplierOverview {
  range: AnalyticsRange;
  totals: {
    clicks: number;
    bookings: number;
    tickets: number;
    revenueByCurrency: Record<string, number>;
    impressions: number;
    views: number;
    uniqueClickers: number;
    activeCampaigns: number;
    activeCampaignRevenue: number;
  };
  clicksByDay: DailyClicks[];
  topSuppliers: SupplierSummary[];
  topSearches: SearchInsights['topQueries'];
}

const responseData = <T>(response: { data: { data: T } }): T => response.data.data;

export function analyticsRange(days: 7 | 30 | 90): AnalyticsRange {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export const adminService = {
  async overview(range: AnalyticsRange): Promise<SupplierOverview> {
    return responseData(await api.get('/admin/overview', { params: range }));
  },
  async suppliers(range: AnalyticsRange): Promise<SupplierSummary[]> {
    return responseData(await api.get('/admin/suppliers', { params: range }));
  },
  async supplier(id: string, range: AnalyticsRange): Promise<SupplierDetail> {
    return responseData(await api.get(`/admin/suppliers/${id}`, { params: range }));
  },
  async updateSupplier(id: string, input: Partial<Pick<
    SupplierSummary,
    'contactName' | 'contactEmail' | 'contactPhone' | 'website' | 'status' | 'notes'
  >>): Promise<SupplierSummary> {
    return responseData(await api.put(`/admin/suppliers/${id}`, input));
  },
  async packages(): Promise<SupplierPackage[]> {
    return responseData(await api.get('/admin/packages'));
  },
  async campaigns(supplierId: string): Promise<SupplierCampaign[]> {
    return responseData(await api.get(`/admin/suppliers/${supplierId}/campaigns`));
  },
  async createCampaign(
    supplierId: string,
    input: {
      packageKey: string;
      eventId?: string;
      startsAt: string;
      endsAt: string;
      priceAed?: number;
      notes?: string | null;
    },
  ): Promise<SupplierCampaign> {
    return responseData(await api.post(`/admin/suppliers/${supplierId}/campaigns`, input));
  },
  async updateCampaignStatus(id: string, status: CampaignStatus): Promise<SupplierCampaign> {
    return responseData(await api.patch(`/admin/campaigns/${id}`, { status }));
  },
  async searchInsights(range: AnalyticsRange): Promise<SearchInsights> {
    return responseData(await api.get('/admin/insights/searches', { params: range }));
  },
  async downloadSupplierCsv(supplier: SupplierSummary, range: AnalyticsRange): Promise<void> {
    const filename = `migo-${supplier.sourceKey}-${range.from.slice(0, 10)}-${range.to.slice(0, 10)}.csv`;
    await downloadCsv(`/admin/suppliers/${supplier.id}/report.csv`, range, filename);
  },
  async downloadSearchInsightsCsv(range: AnalyticsRange): Promise<void> {
    const filename = `migo-search-insights-${range.from.slice(0, 10)}-${range.to.slice(0, 10)}.csv`;
    await downloadCsv('/admin/insights/searches.csv', range, filename);
  },
};

async function downloadCsv(path: string, range: AnalyticsRange, filename: string) {
  const response = await api.get(path, {
    params: range,
    responseType: Platform.OS === 'web' ? 'blob' : 'text',
    transformResponse: Platform.OS === 'web' ? undefined : [(value: string) => value],
  });
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: filename, message: typeof response.data === 'string' ? response.data : String(response.data) });
}
