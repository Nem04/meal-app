import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
let capturedRequest;
let nextResponse;

globalThis.uni = {
  getStorageSync: (key) => storage.get(key) || '',
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: (key) => storage.delete(key),
  request: ({ url, method, data, header, success }) => {
    capturedRequest = { url, method, data, header };
    success({
      statusCode: 200,
      data: {
        ok: true,
        data: nextResponse,
      },
    });
  },
};

beforeEach(() => {
  storage.clear();
  capturedRequest = null;
  nextResponse = null;
});

test('listMealPhotos requests meal photos and expands relative photo URLs', async () => {
  storage.set('family-meal-token', 'token-photos');
  nextResponse = {
    photos: [{
      id: 'photo-1',
      url: '/media/log-photos/a.png',
      mimeType: 'image/png',
      sizeBytes: 20,
      createdAt: '2026-11-10T00:00:00.000Z',
      createdBy: 'Chef',
      createdById: 'member-chef',
    }],
  };
  const { listMealPhotos } = await import('../src/utils/photo-actions.js');

  const photos = await listMealPhotos('meal-1');

  assert.equal(capturedRequest.method, 'GET');
  assert.match(capturedRequest.url, /\/api\/meals\/meal-1\/log\/photos$/);
  assert.equal(capturedRequest.header.Authorization, 'Bearer token-photos');
  assert.deepEqual(photos, [{
    id: 'photo-1',
    url: 'http://192.168.5.2:8080/media/log-photos/a.png',
    mimeType: 'image/png',
    sizeBytes: 20,
    createdAt: '2026-11-10T00:00:00.000Z',
    createdBy: 'Chef',
    createdById: 'member-chef',
  }]);
});

test('listMealPhotos preserves photo URLs that are already absolute', async () => {
  nextResponse = {
    photos: [{
      id: 'photo-2',
      url: 'https://cdn.example.com/log-photos/b.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 30,
      createdAt: '2026-11-10T01:00:00.000Z',
      createdBy: 'Chef',
      createdById: 'member-chef',
    }],
  };
  const { listMealPhotos } = await import('../src/utils/photo-actions.js');

  const photos = await listMealPhotos('meal-2');

  assert.equal(photos[0].url, 'https://cdn.example.com/log-photos/b.jpg');
});

test('uploadMealPhoto posts photo data and expands the returned URL', async () => {
  storage.set('family-meal-token', 'token-upload');
  nextResponse = {
    id: 'photo-3',
    url: '/media/log-photos/c.webp',
    mimeType: 'image/webp',
    sizeBytes: 40,
    createdAt: '2026-11-10T02:00:00.000Z',
    createdBy: 'Chef',
    createdById: 'member-chef',
  };
  const { uploadMealPhoto } = await import('../src/utils/photo-actions.js');

  const photo = await uploadMealPhoto('meal-3', {
    mimeType: 'image/webp',
    data: 'base64-photo-data',
  });

  assert.equal(capturedRequest.method, 'POST');
  assert.match(capturedRequest.url, /\/api\/meals\/meal-3\/log\/photos$/);
  assert.deepEqual(capturedRequest.data, {
    mimeType: 'image/webp',
    data: 'base64-photo-data',
  });
  assert.equal(capturedRequest.header.Authorization, 'Bearer token-upload');
  assert.equal(photo.url, 'http://192.168.5.2:8080/media/log-photos/c.webp');
  assert.equal(photo.id, 'photo-3');
});

test('deleteMealPhoto deletes the requested photo', async () => {
  storage.set('family-meal-token', 'token-delete-photo');
  nextResponse = { deleted: true };
  const { deleteMealPhoto } = await import('../src/utils/photo-actions.js');

  const result = await deleteMealPhoto('meal-4', 'photo-4');

  assert.equal(capturedRequest.method, 'DELETE');
  assert.match(capturedRequest.url, /\/api\/meals\/meal-4\/log\/photos\/photo-4$/);
  assert.equal(capturedRequest.header.Authorization, 'Bearer token-delete-photo');
  assert.deepEqual(result, { deleted: true });
});

test('remainingPhotoSlots enforces the three-photo limit without going negative', async () => {
  const { remainingPhotoSlots } = await import('../src/utils/photo-actions.js');

  assert.equal(remainingPhotoSlots(0, 0), 3);
  assert.equal(remainingPhotoSlots(2, 1), 0);
  assert.equal(remainingPhotoSlots(4, 0), 0);
});

test('mimeTypeFromPath derives supported MIME types from file extensions', async () => {
  const { mimeTypeFromPath } = await import('../src/utils/photo-actions.js');

  assert.equal(mimeTypeFromPath('/tmp/photo.jpg'), 'image/jpeg');
  assert.equal(mimeTypeFromPath('/tmp/photo.jpeg'), 'image/jpeg');
  assert.equal(mimeTypeFromPath('/tmp/photo.PNG'), 'image/png');
  assert.equal(mimeTypeFromPath('/tmp/photo.webp'), 'image/webp');
});

test('相册和相机使用正确的选图参数', async () => {
  const { photoPickerOptions } = await import('../src/utils/photo-actions.js');
  assert.deepEqual(photoPickerOptions('album', 2), {
    count: 2,
    sizeType: ['compressed'],
    sourceType: ['album'],
  });
  assert.deepEqual(photoPickerOptions('camera', 1), {
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['camera'],
  });
});

test('照片列表请求使用饭局照片接口', async () => {
  nextResponse = { photos: [] };
  const { listMealPhotos } = await import('../src/utils/photo-actions.js');
  await listMealPhotos('meal-log');
  assert.equal(capturedRequest.method, 'GET');
  assert.match(capturedRequest.url, /\/api\/meals\/meal-log\/log\/photos$/);
});
