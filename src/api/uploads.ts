import { uploadFile } from './client';

export function uploadEventImage(uri: string) {
  const filename = uri.split('/').pop() ?? 'image.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const ext = match ? match[1].toLowerCase() : 'jpg';
  const type = ext === 'png' ? 'image/png' : ext === 'heic' ? 'image/heic' : 'image/jpeg';

  return uploadFile<{ url: string }>('/uploads/event-image', 'image', { uri, name: filename, type });
}
