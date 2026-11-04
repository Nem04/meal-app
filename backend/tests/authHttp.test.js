import { createServer } from 'node:http';
import { once } from 'node:events';
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_DIR = ':memory:';
process.env.AUTH_MODE = 'wechat';
process.env.WX_APPID = 'wx-app';
process.env.WX_SECRET = 'wx-secret';
process.env.CHEF_BIND_CODE = 'chef-code-12345';
process.env.FAMILY_INVITE_CODE = 'family-code-123';
process.env.SESSION_TTL_DAYS = '30';

const { handle } = await import('../src/routes.js');
const dbm = await import('../src/db.js');
const { AppError } = await import('../src/errors.js');

let server;
let baseUrl;
let nextOpenid = 'openid-chef';

const fakeWechat = {
  async exchangeCode(code) {
    if (code === 'bad-code') {
      throw new AppError(401, 'INVALID_LOGIN_CODE', '微信登录凭证无效');
    }
    return { openid: nextOpenid };
  },
};

before(async () => {
  dbm.openDb();
  server = createServer((req, res) => {
    handle(req, res, new URL(req.url, 'http://localhost'), { wechatClient: fakeWechat });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => {
  nextOpenid = 'openid-chef';
});

after(async () => {
  server.close();
  await once(server, 'close');
  dbm.closeDbForTest();
});

test('未登录访问业务接口返回 401 和稳定错误码', async () => {
  const response = await fetch(`${baseUrl}/meals`);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).data.code, 'UNAUTHORIZED');
});

test('主厨绑定后可以访问业务接口，成员响应不泄露 openid', async () => {
  const login = await fetch(`${baseUrl}/auth/wechat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'good-code' }),
  });
  assert.equal((await login.json()).data.status, 'needs_binding');

  const bind = await fetch(`${baseUrl}/auth/bind`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'good-code',
      kind: 'chef',
      inviteCode: 'chef-code-12345',
      displayName: '爸爸',
    }),
  });
  const bindBody = await bind.json();
  assert.equal(bindBody.data.member.role, 'chef');

  const members = await fetch(`${baseUrl}/members`, {
    headers: { Authorization: `Bearer ${bindBody.data.token}` },
  });
  assert.equal(members.status, 200);
  assert.equal((await members.text()).includes('openid'), false);

  const meal = await fetch(`${baseUrl}/meals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bindBody.data.token}`,
    },
    body: JSON.stringify({ title: '今晚', created_by: '伪造的人' }),
  });
  assert.equal((await meal.json()).data.created_by, '爸爸');
});

test('家人不能创建饭局', async () => {
  nextOpenid = 'openid-family';
  const bind = await fetch(`${baseUrl}/auth/bind`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'good-code',
      kind: 'family',
      inviteCode: 'family-code-123',
      displayName: '妈妈',
    }),
  });
  const family = await bind.json();
  const denied = await fetch(`${baseUrl}/meals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${family.data.token}`,
    },
    body: JSON.stringify({ title: '今晚' }),
  });
  assert.equal(denied.status, 403);
});

test('健康检查不需要认证', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.status, 'ok');
});
