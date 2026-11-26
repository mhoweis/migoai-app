import { Platform } from 'react-native';
import { api, API_BASE_URL } from './api';
export const uploadService = {
  async uploadImage(uri: string, file?: { name: string; type: string }): Promise<string> {
    const form = new FormData();
    if (typeof window !== 'undefined') {
      const blob = await fetch(uri).then(response => response.blob());
      form.append('image', blob, file?.name || 'cover.jpg');
    } else {
      form.append('image', { uri, name: file?.name || 'cover.jpg', type: file?.type || 'image/jpeg' } as any);
    }
    const response = await api.post('/upload/image', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    const { url, path } = response.data.data as { url: string; path?: string };
    if (!path) return url;
    // Files on the API server's disk live on the API's host, not the website's
    // (the website is on Vercel). Only fall back to the page's own origin when
    // the API is served from the same place (API_BASE_URL is empty).
    const origin = API_BASE_URL
      || (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : '');
    return origin ? `${origin}${path}` : url;
  },
};
