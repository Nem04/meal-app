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

test('多个 openid 可以创建多个同角色成员', () => {
  const first = repo.bindMemberAccount({
    openid: 'openid-chef-a',
    role: 'chef',
    name: '爸爸',
    color: '#D96A3B',
    boundAt: '2026-11-05T00:00:00.000Z',
  });
  const second = repo.bindMemberAccount({
    openid: 'openid-chef-b',
    role: 'chef',
    name: '爷爷',
    color: '#D96A3B',
    boundAt: '2026-11-05T00:01:00.000Z',
  });

  assert.notEqual(first.id, second.id);
  assert.equal(first.role, 'chef');
  assert.equal(second.role, 'chef');
  assert.equal(repo.listBoundMembers().filter((m) => m.role === 'chef').length, 2);
});

test('同一个 openid 不能创建两条成员记录', () => {
  repo.bindMemberAccount({
    openid: 'openid-duplicate',
    role: 'member',
    name: '妈妈',
    color: '#5B8C5A',
    boundAt: '2026-11-05T00:00:00.000Z',
  });

  assert.throws(
    () => repo.bindMemberAccount({
      openid: 'openid-duplicate',
      role: 'chef',
      name: '另一个人',
      color: '#D96A3B',
      boundAt: '2026-11-05T00:01:00.000Z',
    }),
    (error) => error.code === 'OPENID_ALREADY_BOUND',
  );
  assert.equal(
    repo.listBoundMembers().filter((m) => m.openid === 'openid-duplicate').length,
    1,
  );
});

test('已绑定成员列表不包含未绑定的历史种子槽位', () => {
  assert.equal(repo.listBoundMembers().length, 0);
  repo.bindMemberAccount({
    openid: 'openid-family',
    role: 'member',
    name: '妈妈',
    color: '#5B8C5A',
    boundAt: '2026-11-05T00:00:00.000Z',
  });

  const bound = repo.listBoundMembers();
  assert.equal(bound.length, 1);
  assert.equal(bound[0].openid, 'openid-family');
  assert.ok(bound.every((m) => m.openid !== null));
});
