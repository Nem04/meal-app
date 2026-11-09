import { request } from './index.js';
import { BASE_URL } from './http.js';

const MAX_PHOTOS = 3;

export function remainingPhotoSlots(existingCount, localCount) {
  return Math.max(0, MAX_PHOTOS - Number(existingCount || 0) - Number(localCount || 0));
}

export function mimeTypeFromPath(path) {
  const normalized = String(path || '').toLowerCase();
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function absolutePhoto(photo) {
  return {
    ...photo,
    url: photo.url.startsWith('http') ? photo.url : `${BASE_URL}${photo.url}`,
  };
}

export async function listMealPhotos(mealId) {
  const data = await request(`/meals/${mealId}/log/photos`);
  return (data.photos || []).map(absolutePhoto);
}

export async function uploadMealPhoto(mealId, { mimeType, data }) {
  const photo = await request(`/meals/${mealId}/log/photos`, 'POST', { mimeType, data });
  return absolutePhoto(photo);
}

export function deleteMealPhoto(mealId, photoId) {
  return request(`/meals/${mealId}/log/photos/${photoId}`, 'DELETE');
}
