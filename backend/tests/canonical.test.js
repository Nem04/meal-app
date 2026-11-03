import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalName, normalizeUnit, mergeKey } from '../src/domain/canonical.js';

test('规范名称：小葱收敛为葱', () => {
  assert.equal(canonicalName('小葱'), '葱');
  assert.equal(canonicalName('香葱'), '葱');
});

test('规范单位：只收敛为个', () => {
  assert.equal(normalizeUnit('只'), '个');
  assert.equal(normalizeUnit('市斤'), '斤');
});

test('mergeKey 组合', () => {
  assert.equal(mergeKey('小葱', '根'), '葱|根');
});
