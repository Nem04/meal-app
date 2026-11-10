import test from 'node:test';
import assert from 'node:assert/strict';

import { recipeVersionPayload } from '../src/utils/recipe-actions.js';

test('详细步骤可以为空', () => {
  const payload = recipeVersionPayload([
    { raw_name: '鸡蛋', quantity: 3, unit: '个', id: 'ignored' },
  ], '');

  assert.deepEqual(payload, {
    specs: [{ raw_name: '鸡蛋', quantity: 3, unit: '个' }],
    steps: '',
  });
});

test('编辑详细步骤时保留多行内容和现有食材', () => {
  const payload = recipeVersionPayload([
    { raw_name: '番茄', quantity: 2, unit: '个' },
  ], '1. 番茄切块\n2. 鸡蛋打散');

  assert.equal(payload.steps, '1. 番茄切块\n2. 鸡蛋打散');
  assert.deepEqual(payload.specs, [
    { raw_name: '番茄', quantity: 2, unit: '个' },
  ]);
});
