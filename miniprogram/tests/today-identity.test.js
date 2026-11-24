import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const todayPage = readFileSync(
  new URL('../src/pages/today/today.vue', import.meta.url),
  'utf8',
);

test('身份标签本身就是更改身份入口', () => {
  assert.match(
    todayPage,
    /<text class="role-chip" @tap="goRole">/,
  );
  assert.match(todayPage, /:\s*'游客'/);
});

test('身份标签不再显示独立的更改身份按钮', () => {
  assert.doesNotMatch(todayPage, /class="role-action"/);
  assert.doesNotMatch(todayPage, />\s*更改身份\s*</);
});

test('身份标签紧跟问候语而不是被推到页面最右侧', () => {
  const greetingIndex = todayPage.indexOf('{{ greetingLine }}');
  const identityIndex = todayPage.indexOf('class="role-chip"');
  const roleChipStyle = todayPage.match(/\.role-chip\s*\{([^}]*)\}/)?.[1] || '';

  assert.ok(greetingIndex >= 0);
  assert.ok(identityIndex > greetingIndex);
  assert.doesNotMatch(roleChipStyle, /margin-left\s*:\s*auto/);
});
