import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_DIR = ':memory:';

const svc = await import('../src/services.js');
const dbm = await import('../src/db.js');

before(() => { dbm.openDb(); });
afterEach(() => { dbm.closeDbForTest(); });

const appConfig = {
  chefBindCode: 'chef-code-12345',
  familyInviteCode: 'family-code-123',
  sessionTtlDays: 30,
};

function fakeWechat(openid) {
  return {
    async exchangeCode() {
      return { openid };
    },
  };
}

async function bind(kind, openid, name) {
  return svc.bindWechatMember({
    code: 'good-code',
    kind,
    inviteCode: kind === 'chef' ? 'chef-code-12345' : 'family-code-123',
    displayName: name,
    wechatClient: fakeWechat(openid),
    appConfig,
  });
}

test('家人输入主厨码后升级为主厨，原 token 仍然有效', async () => {
  const bound = await bind('family', 'openid-family-upgrade', '妈妈');
  const updated = svc.changeMemberRole({
    member: bound.member,
    kind: 'chef',
    inviteCode: 'chef-code-12345',
    appConfig,
  });

  assert.equal(updated.role, 'chef');
  assert.equal(svc.authenticateToken(bound.token).member.role, 'chef');
});

test('多个主厨时一个主厨可以降级为家人', async () => {
  const first = await bind('chef', 'openid-chef-one', '主厨一');
  await bind('chef', 'openid-chef-two', '主厨二');

  const updated = svc.changeMemberRole({
    member: first.member,
    kind: 'family',
    inviteCode: 'family-code-123',
    appConfig,
  });

  assert.equal(updated.role, 'member');
  assert.equal(svc.authenticateToken(first.token).member.role, 'member');
});

test('最后一个主厨不能降级为家人', async () => {
  const onlyChef = await bind('chef', 'openid-only-chef', '唯一主厨');

  assert.throws(
    () => svc.changeMemberRole({
      member: onlyChef.member,
      kind: 'family',
      inviteCode: 'family-code-123',
      appConfig,
    }),
    (error) => error.code === 'LAST_CHEF_REQUIRED',
  );
  assert.equal(svc.authenticateToken(onlyChef.token).member.role, 'chef');
});

test('错误主厨码不会改变家人角色', async () => {
  const family = await bind('family', 'openid-wrong-code', '家人甲');

  assert.throws(
    () => svc.changeMemberRole({
      member: family.member,
      kind: 'chef',
      inviteCode: 'wrong-code',
      appConfig,
    }),
    (error) => error.code === 'INVALID_INVITE_CODE',
  );
  assert.equal(svc.authenticateToken(family.token).member.role, 'member');
});
