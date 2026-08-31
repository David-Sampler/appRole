import { uploadFile } from './client';

export function uploadEventImage(uri: string) {
  return uploadFile<{ url: string }>('/uploads/event-image', 'image', uri);
}
