import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInventoryText } from '../src/domain/parseInventory.js';

test('整段文本一次解析 3 条', () => {
  const { items, failed } = parseInventoryText('芹菜一斤，酱油一瓶、鸡蛋十个');
  assert.deepEqual(failed, []);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => [i.name, i.quantity, i.unit]), [
    ['芹菜', 1, '斤'], ['酱油', 1, '瓶'], ['鸡蛋', 10, '个'],
  ]);
});

test('数字形式：鸡蛋10个', () => {
  const [i] = parseInventoryText('鸡蛋10个').items;
  assert.deepEqual([i.name, i.quantity, i.unit], ['鸡蛋', 10, '个']);
});

test('无空格中文和数字数量：鸡蛋三个、鸡蛋3个', () => {
  const { items, failed } = parseInventoryText('鸡蛋三个\n鸡蛋3个');
  assert.deepEqual(failed, []);
  assert.deepEqual(
    items.map((item) => [item.raw_name, item.quantity, item.unit]),
    [['鸡蛋', 3, '个'], ['鸡蛋', 3, '个']],
  );
});

test('半瓶归一化', () => {
  const [i] = parseInventoryText('酱油半瓶').items;
  assert.deepEqual([i.name, i.quantity, i.unit], ['酱油', 0.5, '瓶']);
});

test('无法解析进入 failed', () => {
  const { failed } = parseInventoryText('随便乱写的碎碎念');
  assert.deepEqual(failed, ['随便乱写的碎碎念']);
});
