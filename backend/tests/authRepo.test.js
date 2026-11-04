import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_DIR = ':memory:';
const repo = await import('../src/repo.js');
const dbm = await import('../src/db.js');

before(() => { dbm.openDb(); });
afterEach(() => { dbm.closeDbForTest(); });

test('迁移创建绑定字段、会话表和提交审计表', () => {
  const memberCols = repo.db().prepare('PRAGMA table_info(family_member)').all();
  const tables = repo.db()
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((row) => row.name);
  assert.ok(memberCols.some((col) => col.name === 'bound_at'));
  assert.ok(tables.includes('auth_session'));
  assert.ok(tables.includes('meal_item_submission'));
});

test('一个成员槽位只能绑定一个 openid', () => {
  const member = repo.bindMemberSlot({
    openid: 'openid-first',
    memberId: 'member-chef',
    name: '爸爸',
    boundAt: '2026-11-04T00:00:00.000Z',
  });
  assert.equal(member.name, '爸爸');
  assert.throws(
    () => repo.bindMemberSlot({
      openid: 'openid-second',
      memberId: 'member-chef',
      name: '别人',
      boundAt: '2026-11-04T00:01:00.000Z',
    }),
    /已经绑定/,
  );
});

test('会话可以创建、查询和删除', () => {
  repo.createAuthSession({
    tokenHash: 'hash-1',
    memberId: 'member-chef',
    createdAt: '2026-11-04T00:00:00.000Z',
    expiresAt: '2026-12-04T00:00:00.000Z',
  });
  assert.equal(repo.getAuthSessionByHash('hash-1').member_id, 'member-chef');
  assert.equal(repo.deleteAuthSession('hash-1'), 1);
  assert.equal(repo.getAuthSessionByHash('hash-1'), undefined);
});
