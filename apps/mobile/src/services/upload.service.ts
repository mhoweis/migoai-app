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
    const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : API_BASE_URL;
    return origin ? `${origin}${path}` : url;
  },
};
