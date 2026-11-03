import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeIngredients } from '../src/domain/merge.js';

test('同名称同单位合并求和', () => {
  const items = [
    { raw_name: '小葱', canonical_name: '葱', quantity: 1, unit: '根' },
    { raw_name: '香葱', canonical_name: '葱', quantity: 2, unit: '根' },
  ];
  const out = mergeIngredients(items);
  assert.equal(out.length, 1);
  assert.equal(out[0].canonical_name, '葱');
  assert.equal(out[0].total_quantity, 3);
});

test('三道菜都要葱只出现一条葱', () => {
  const items = [
    { raw_name: '葱', canonical_name: '葱', quantity: 1, unit: '根' },
    { raw_name: '葱', canonical_name: '葱', quantity: 2, unit: '根' },
    { raw_name: '葱', canonical_name: '葱', quantity: 3, unit: '根' },
  ];
  const out = mergeIngredients(items);
  assert.equal(out.length, 1);
  assert.equal(out[0].total_quantity, 6);
});

test('不同单位保留两条并带跨单位提示', () => {
  const items = [
    { raw_name: '葱', canonical_name: '葱', quantity: 1, unit: '根' },
    { raw_name: '葱', canonical_name: '葱', quantity: 1, unit: '斤' },
  ];
  const out = mergeIngredients(items);
  assert.equal(out.length, 2);
  assert.ok(out.every((m) => m.cross_unit_note));
});

test('数量类型转换容错', () => {
  const out = mergeIngredients([{ raw_name: '鸡蛋', canonical_name: '鸡蛋', quantity: '3', unit: '个' }]);
  assert.equal(out[0].total_quantity, 3);
});
