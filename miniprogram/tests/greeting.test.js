import test from 'node:test';
import assert from 'node:assert/strict';

import { getGreeting } from '../src/utils/greeting.js';

const cases = [
  [0, '夜深了，早点休息～'],
  [4, '夜深了，早点休息～'],
  [5, '早上好'],
  [10, '早上好'],
  [11, '中午好'],
  [13, '中午好'],
  [14, '下午好'],
  [17, '下午好'],
  [18, '傍晚好'],
  [23, '傍晚好'],
];

for (const [hour, expected] of cases) {
  test(`${hour.toString().padStart(2, '0')}:00 uses the correct greeting`, () => {
    assert.equal(getGreeting(new Date(2026, 10, 4, hour, 0)), expected);
  });
}

test('04:59 is still late night and 05:00 becomes morning', () => {
  assert.equal(getGreeting(new Date(2026, 10, 4, 4, 59)), '夜深了，早点休息～');
  assert.equal(getGreeting(new Date(2026, 10, 4, 5, 0)), '早上好');
});

test('13:59 is still noon and 14:00 becomes afternoon', () => {
  assert.equal(getGreeting(new Date(2026, 10, 4, 13, 59)), '中午好');
  assert.equal(getGreeting(new Date(2026, 10, 4, 14, 0)), '下午好');
});
