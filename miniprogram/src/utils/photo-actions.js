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

export function photoPickerOptions(sourceType, count) {
  return {
    count,
    sizeType: ['compressed'],
    sourceType: [sourceType],
  };
}

export function compressImage(src, quality = 80) {
  return new Promise((resolve, reject) => {
    uni.compressImage({
      src,
      quality,
      success: (result) => resolve(result.tempFilePath),
      fail: (error) => reject(new Error(error.errMsg || '图片压缩失败')),
    });
  });
}

export function getFileSize(filePath) {
  return new Promise((resolve, reject) => {
    uni.getFileInfo({
      filePath,
      success: (result) => resolve(result.size),
      fail: (error) => reject(new Error(error.errMsg || '读取文件信息失败')),
    });
  });
}

export function readFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    uni.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (result) => resolve(result.data),
      fail: (error) => reject(new Error(error.errMsg || '读取图片失败')),
    });
  });
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
