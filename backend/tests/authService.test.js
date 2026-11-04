import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_DIR = ':memory:';
const svc = await import('../src/services.js');
const repo = await import('../src/repo.js');
const dbm = await import('../src/db.js');
const { createWechatClient } = await import('../src/auth/wechat.js');
const { hashSessionToken } = await import('../src/auth/session.js');
const { AppError } = await import('../src/errors.js');

before(() => { dbm.openDb(); });
afterEach(() => { dbm.closeDbForTest(); });

const appConfig = {
  chefBindCode: 'chef-code-12345',
  familyInviteCode: 'family-code-123',
  sessionTtlDays: 30,
};

function fakeWechat(openid = 'openid-chef') {
  return {
    async exchangeCode(code) {
      if (code === 'bad-code') {
        throw new AppError(401, 'INVALID_LOGIN_CODE', '微信登录凭证无效');
      }
      return { openid };
    },
  };
}

test('未绑定 openid 返回 needs_binding', async () => {
  const result = await svc.loginWithWechat({
    code: 'good-code',
    wechatClient: fakeWechat('openid-new'),
    appConfig,
  });
  assert.deepEqual(result, { status: 'needs_binding' });
});

test('正确主厨口令绑定主厨并签发会话', async () => {
  const result = await svc.bindWechatMember({
    code: 'good-code',
    kind: 'chef',
    inviteCode: 'chef-code-12345',
    displayName: '爸爸',
    wechatClient: fakeWechat('openid-chef'),
    appConfig,
  });
  assert.equal(result.status, 'bound');
  assert.equal(result.member.role, 'chef');
  assert.equal(result.member.name, '爸爸');
  assert.ok(result.token);
  assert.equal(repo.getMemberByOpenid('openid-chef').id, 'member-chef');
});

test('错误家人邀请码被拒绝', async () => {
  await assert.rejects(
    () => svc.bindWechatMember({
      code: 'good-code',
      kind: 'family',
      inviteCode: 'wrong-code',
      displayName: '妈妈',
      wechatClient: fakeWechat('openid-family'),
      appConfig,
    }),
    (error) => error.code === 'INVALID_INVITE_CODE',
  );
});

test('token 可鉴权，注销后立即失效', async () => {
  const result = await svc.bindWechatMember({
    code: 'good-code',
    kind: 'family',
    inviteCode: 'family-code-123',
    displayName: '妈妈',
    wechatClient: fakeWechat('openid-family'),
    appConfig,
  });
  const auth = svc.authenticateToken(result.token);
  assert.equal(auth.member.id, 'member-family');
  svc.logoutToken(result.token);
  assert.throws(() => svc.authenticateToken(result.token));
});

test('过期 token 被拒绝', async () => {
  const result = await svc.bindWechatMember({
    code: 'good-code',
    kind: 'family',
    inviteCode: 'family-code-123',
    displayName: '妈妈',
    wechatClient: fakeWechat('openid-expired'),
    appConfig,
  });
  repo.db().prepare('UPDATE auth_session SET expires_at = ? WHERE token_hash = ?')
    .run('2020-01-01T00:00:00.000Z', hashSessionToken(result.token));
  assert.throws(
    () => svc.authenticateToken(result.token),
    (error) => error.code === 'UNAUTHORIZED',
  );
});

test('微信客户端解析 openid 且不返回 session_key', async () => {
  const client = createWechatClient({
    appId: 'wx-app',
    appSecret: 'wx-secret',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ openid: 'openid-from-wechat', session_key: 'must-not-leak' }),
    }),
  });
  assert.deepEqual(await client.exchangeCode('code-1'), { openid: 'openid-from-wechat' });
});

test('绑定失败达到 5 次后触发限流，窗口结束后恢复', async () => {
  const { createAttemptLimiter } = await import('../src/auth/rateLimit.js');
  let now = 0;
  const limiter = createAttemptLimiter({
    limit: 5,
    windowMs: 1000,
    now: () => now,
  });
  for (let i = 0; i < 5; i += 1) {
    limiter.assertAllowed('ip:openid:family');
    limiter.recordFailure('ip:openid:family');
  }
  assert.throws(
    () => limiter.assertAllowed('ip:openid:family'),
    (error) => error.code === 'TOO_MANY_ATTEMPTS',
  );
  now = 1001;
  assert.doesNotThrow(() => limiter.assertAllowed('ip:openid:family'));
});
