import { Platform, Share } from 'react-native';
import { api } from './api';
import type { User } from './auth.service';
import type { SupplierPackage } from './admin.service';

export type PlanKey = 'HOST' | 'SUPPLIER';
export type AccountPlan = {
  key: PlanKey;
  priceAed: number;
  currency: 'AED';
  periodDays: number;
};

export type Subscription = {
  id: string;
  plan: PlanKey;
  status: 'PENDING' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED';
  amountAed: number;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
};

export type SupplierProfile = {
  id: string;
  sourceKey: string;
  slug: string | null;
  name: string;
  description: string | null;
  logo: string | null;
  banner: string | null;
  website: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  feedUrl: string | null;
  feedLastSyncAt: string | null;
  feedLastStatus: string | null;
  status: string;
};

function data<T>(response: { data: { data: T } }): T {
  return response.data.data;
}

export const accountTypesService = {
  async plans(): Promise<{ plans: AccountPlan[]; state: { role: User['role']; status: User['status']; supplier: { id: string; name: string; slug: string | null } | null; subscription: Subscription | null } }> {
    return data(await api.get('/account/plans'));
  },

  async subscribe(input: {
    plan: PlanKey;
    returnUrl: string;
    businessName?: string;
    website?: string;
  }): Promise<{ subscription: Subscription; checkoutUrl: string }> {
    return data(await api.post('/account/subscribe', input));
  },

  async cancel(): Promise<Subscription | null> {
    return data<{ subscription: Subscription | null }>(await api.post('/account/cancel')).subscription;
  },

  async supplierProfile(supplierId?: string): Promise<SupplierProfile> {
    return data(await api.get('/supplier/me', { params: supplierId ? { supplierId } : undefined }));
  },

  async updateSupplierProfile(input: Partial<Pick<SupplierProfile,
    'name' | 'description' | 'logo' | 'banner' | 'website' | 'contactName' | 'contactEmail' | 'contactPhone'
  >>, supplierId?: string): Promise<SupplierProfile> {
    return data(await api.put('/supplier/me', input, { params: supplierId ? { supplierId } : undefined }));
  },

  async setFeedUrl(feedUrl: string | null, supplierId?: string): Promise<void> {
    await api.put('/supplier/me/feed', { feedUrl }, { params: supplierId ? { supplierId } : undefined });
  },

  async syncFeed(supplierId?: string): Promise<{ fetched: number; upserted: number; errors: number }> {
    return data(await api.post('/supplier/me/feed/sync', {}, { params: supplierId ? { supplierId } : undefined }));
  },

  async feedFormat(supplierId?: string): Promise<any> {
    return data(await api.get('/supplier/me/feed/format', { params: supplierId ? { supplierId } : undefined }));
  },

  async supplierEvents(supplierId?: string): Promise<any[]> {
    const result = data<{ events: any[] }>(
      await api.get('/supplier/me/events', { params: supplierId ? { supplierId } : undefined }),
    );
    return result.events;
  },

  async saveEventOrder(eventIds: string[], supplierId?: string): Promise<void> {
    await api.put('/supplier/me/events/order', { eventIds }, { params: supplierId ? { supplierId } : undefined });
  },

  async supplierReport(days: 7 | 30 | 90, supplierId?: string): Promise<any> {
    return data(await api.get('/supplier/me/report', { params: { days, ...(supplierId ? { supplierId } : {}) } }));
  },

  async supplierPackages(supplierId?: string): Promise<SupplierPackage[]> {
    return data(await api.get('/supplier/me/packages', { params: supplierId ? { supplierId } : undefined }));
  },

  async requestCampaign(input: {
    packageKey: string;
    eventId?: string;
    startsAt: string;
  }, supplierId?: string): Promise<any> {
    return data(await api.post('/supplier/me/campaigns', input, { params: supplierId ? { supplierId } : undefined }));
  },

  async downloadSupplierReport(days: 7 | 30 | 90, filename: string, supplierId?: string): Promise<void> {
    const response = await api.get('/supplier/me/report.csv', {
      params: { days, ...(supplierId ? { supplierId } : {}) },
      responseType: Platform.OS === 'web' ? 'blob' : 'text',
      transformResponse: Platform.OS === 'web' ? undefined : [(value: string) => value],
    });
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: 'text/csv;charset=utf-8' });
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
  },

  async publicSupplier(slug: string): Promise<{
    supplier: Pick<SupplierProfile, 'name' | 'description' | 'logo' | 'banner' | 'website' | 'slug'> & { verified: boolean };
    events: any[];
  }> {
    return data(await api.get(`/suppliers/${encodeURIComponent(slug)}`));
  },

  async adminUsers(params: Record<string, string | number | undefined>): Promise<any> {
    return data(await api.get('/admin/users', { params }));
  },

  async updateAdminUser(id: string, input: {
    status?: 'ACTIVE' | 'PAUSED';
    reason?: string;
    role?: User['role'];
    supplierId?: string | null;
  }): Promise<any> {
    return data(await api.patch(`/admin/users/${id}`, input));
  },

  async adminEvents(params: Record<string, string | number | undefined>): Promise<any> {
    return data(await api.get('/admin/events', { params }));
  },

  async banEvent(id: string, reason: string): Promise<any> {
    return data(await api.post(`/admin/events/${id}/ban`, { reason }));
  },

  async unbanEvent(id: string): Promise<any> {
    return data(await api.post(`/admin/events/${id}/unban`));
  },

  async adminActions(limit = 50): Promise<any[]> {
    return data(await api.get('/admin/actions', { params: { limit } }));
  },
};
