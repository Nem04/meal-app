import test from 'node:test';
import assert from 'node:assert/strict';

import { isRecipeOrdered, orderedRecipeIds } from '../src/utils/point-actions.js';

test('已点的菜按菜谱 ID 去重并识别', () => {
  const ordered = orderedRecipeIds([
    { recipe_id: 'recipe-a' },
    { recipe_id: 'recipe-b' },
    { recipe_id: 'recipe-a' },
  ]);

  assert.deepEqual(ordered, ['recipe-a', 'recipe-b']);
  assert.equal(isRecipeOrdered({ id: 'recipe-a' }, ordered), true);
  assert.equal(isRecipeOrdered({ id: 'recipe-c' }, ordered), false);
});

test('旧数据缺少菜谱 ID 时不会误判', () => {
  const ordered = orderedRecipeIds([
    { recipe_id: null },
    { recipe_id: '' },
  ]);

  assert.deepEqual(ordered, []);
  assert.equal(isRecipeOrdered({ id: '' }, ordered), false);
});
