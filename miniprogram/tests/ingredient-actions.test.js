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
    success({ statusCode: 200, data: { ok: true, data: nextResponse } });
  },
};

beforeEach(() => {
  storage.clear();
  capturedRequest = null;
  nextResponse = { items: [], failed: [] };
});

test('无空格中文数量和数字数量都能转成菜谱食材', async () => {
  storage.set('family-meal-token', 'token-ingredient');
  nextResponse = {
    items: [
      { name: '鸡蛋', raw_name: '鸡蛋', quantity: 3, unit: '个' },
      { name: '番茄', raw_name: '番茄', quantity: 2, unit: '个' },
    ],
    failed: [],
  };
  const { parseIngredientLines } = await import('../src/utils/ingredient-actions.js');

  const specs = await parseIngredientLines('鸡蛋三个\n番茄2个');

  assert.equal(capturedRequest.method, 'POST');
  assert.match(capturedRequest.url, /\/api\/inventory\/parse$/);
  assert.equal(capturedRequest.data.text, '鸡蛋三个\n番茄2个');
  assert.equal(capturedRequest.header.Authorization, 'Bearer token-ingredient');
  assert.deepEqual(specs, [
    { raw_name: '鸡蛋', quantity: 3, unit: '个' },
    { raw_name: '番茄', quantity: 2, unit: '个' },
  ]);
});

test('存在未识别食材时拒绝保存并提示具体内容', async () => {
  nextResponse = {
    items: [{ name: '鸡蛋', raw_name: '鸡蛋', quantity: 3, unit: '个' }],
    failed: ['盐若干'],
  };
  const { parseIngredientLines } = await import('../src/utils/ingredient-actions.js');

  await assert.rejects(
    () => parseIngredientLines('鸡蛋3个\n盐若干'),
    (error) => error.message.includes('盐若干'),
  );
});
