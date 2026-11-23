import test from 'node:test';
import assert from 'node:assert/strict';

import { mealsForDate } from '../src/utils/log-actions.js';

test('按日期筛选当天全部饭局', () => {
  const meals = mealsForDate([
    { id: 'dinner', meal_date: '2026-11-08', created_at: '2026-11-08T10:00:00.000Z' },
    { id: 'other', meal_date: '2026-11-07', created_at: '2026-11-07T10:00:00.000Z' },
    { id: 'breakfast', meal_date: '2026-11-08', created_at: '2026-11-08T01:00:00.000Z' },
  ], '2026-11-08');

  assert.deepEqual(meals.map((meal) => meal.id), ['breakfast', 'dinner']);
});

test('没有记录的日期返回空数组', () => {
  assert.deepEqual(mealsForDate([], '2026-11-08'), []);
});
