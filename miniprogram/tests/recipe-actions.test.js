import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RECIPE_CATEGORIES,
  pickRecipeCategory,
  recipeListQuery,
  recipeVersionPayload,
} from '../src/utils/recipe-actions.js';

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

test('菜谱分类包含荤素汤等标准选项', () => {
  assert.deepEqual(RECIPE_CATEGORIES, [
    '荤',
    '素',
    '汤',
    '主食',
    '凉菜',
    '饮品',
    '其他',
  ]);
});

test('选择菜谱分类返回用户点选的分类', async () => {
  const calls = [];
  globalThis.uni = {
    showActionSheet({ itemList, success }) {
      calls.push(itemList);
      assert.ok(itemList.length <= 6, '微信操作菜单最多只能包含 6 项');
      success({ tapIndex: 2 });
    },
  };

  assert.equal(await pickRecipeCategory(), '汤');
  assert.equal(calls.length, 1);
});

test('分类超过 6 项时可以通过更多分类选择饮品', async () => {
  const calls = [];
  globalThis.uni = {
    showActionSheet({ itemList, success }) {
      calls.push(itemList);
      assert.ok(itemList.length <= 6, '微信操作菜单最多只能包含 6 项');
      success({ tapIndex: calls.length === 1 ? 5 : 0 });
    },
  };

  assert.equal(await pickRecipeCategory(), '饮品');
  assert.deepEqual(calls, [
    ['荤', '素', '汤', '主食', '凉菜', '更多分类'],
    ['饮品', '其他'],
  ]);
});

test('取消分类选择返回 null', async () => {
  globalThis.uni = {
    showActionSheet({ fail }) {
      fail({ errMsg: 'cancel' });
    },
  };

  assert.equal(await pickRecipeCategory(), null);
});

test('菜谱搜索查询同时携带分类和关键词', () => {
  assert.equal(
    recipeListQuery('汤', '番茄'),
    '?category=%E6%B1%A4&q=%E7%95%AA%E8%8C%84',
  );
  assert.equal(recipeListQuery('全部', ''), '');
});
