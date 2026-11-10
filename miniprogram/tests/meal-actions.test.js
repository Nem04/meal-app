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
        data: nextResponse ?? (method === 'DELETE'
          ? { deleted: true, item_id: 'item-1' }
          : { id: 'meal-1', status: 'closed' }),
      },
    });
  },
};

beforeEach(() => {
  storage.clear();
  capturedRequest = null;
  nextResponse = null;
});

test('主厨结束点菜调用饭局 close 接口', async () => {
  storage.set('family-meal-token', 'token-close');
  const { closeMeal } = await import('../src/utils/meal-actions.js');

  const result = await closeMeal('meal-1');

  assert.equal(capturedRequest.method, 'PATCH');
  assert.match(capturedRequest.url, /\/api\/meals\/meal-1\/close$/);
  assert.deepEqual(capturedRequest.data, {});
  assert.equal(capturedRequest.header.Authorization, 'Bearer token-close');
  assert.equal(result.status, 'closed');
});

test('删除已点菜品调用饭局 items 删除接口', async () => {
  storage.set('family-meal-token', 'token-delete');
  const { deleteMealItem } = await import('../src/utils/meal-actions.js');

  const result = await deleteMealItem('meal-1', 'item-1');

  assert.equal(capturedRequest.method, 'DELETE');
  assert.match(capturedRequest.url, /\/api\/meals\/meal-1\/items\/item-1$/);
  assert.equal(capturedRequest.header.Authorization, 'Bearer token-delete');
  assert.equal(result.deleted, true);
});

test('删除吃过的饭调用饭局删除接口', async () => {
  storage.set('family-meal-token', 'token-delete-meal');
  const { deleteMeal } = await import('../src/utils/meal-actions.js');

  const result = await deleteMeal('meal-2');

  assert.equal(capturedRequest.method, 'DELETE');
  assert.match(capturedRequest.url, /\/api\/meals\/meal-2$/);
  assert.equal(capturedRequest.header.Authorization, 'Bearer token-delete-meal');
  assert.equal(result.deleted, true);
});

test('查看详情请求饭局详情接口', async () => {
  storage.set('family-meal-token', 'token-detail');
  nextResponse = {
    id: 'meal-detail',
    title: '详情饭局',
    items: [
      { recipe_name: '番茄炒蛋', quantity: 2, submitter: '妈妈', note: '少辣' },
    ],
  };
  const { getMealDetail } = await import('../src/utils/meal-actions.js');

  const result = await getMealDetail('meal-detail');

  assert.equal(capturedRequest.method, 'GET');
  assert.match(capturedRequest.url, /\/api\/meals\/meal-detail$/);
  assert.equal(capturedRequest.header.Authorization, 'Bearer token-detail');
  assert.equal(result.items[0].recipe_name, '番茄炒蛋');
});
