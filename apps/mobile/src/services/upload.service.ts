import { api } from './api';
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
    return response.data.data.url;
  },
};
