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
const repo = await import('../src/repo.js');
const { hashSessionToken } = await import('../src/auth/session.js');

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

function setName(memberId, name) {
  repo.db().prepare('UPDATE family_member SET name = ? WHERE id = ?').run(name, memberId);
}

function mintSession(memberId) {
  const token = `test-token-${memberId}-${Math.random().toString(36).slice(2)}`;
  repo.createAuthSession({
    tokenHash: hashSessionToken(token),
    memberId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  return token;
}

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

test('点菜提交使用会话成员，伪造 submitter 与 x-member-id 均被忽略', async () => {
  setName('member-chef', '爸爸');
  const chefToken = mintSession('member-chef');
  const mealResp = await fetch(`${baseUrl}/meals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chefToken}` },
    body: JSON.stringify({ title: '今晚', meal_date: '2026-11-04' }),
  });
  assert.equal(mealResp.status, 201);
  const meal = (await mealResp.json()).data;

  setName('member-family', '妈妈');
  const familyToken = mintSession('member-family');
  const orderResp = await fetch(`${baseUrl}/meals/${meal.id}/items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${familyToken}`,
      'x-member-id': 'member-chef',
    },
    body: JSON.stringify({
      recipe_version_id: 'recipe-seed-001-v1',
      submitter: '伪造的人',
      note: '少辣',
    }),
  });
  assert.equal(orderResp.status, 201);
  const order = (await orderResp.json()).data;
  assert.equal(order.meal.items[0].submitter, '妈妈');
  assert.equal(order.meal.submissions[0].member_name_snapshot, '妈妈');
  assert.ok(!JSON.stringify(order).includes('伪造的人'));
});

test('库存变更使用会话主厨，伪造 operator 被忽略', async () => {
  setName('member-chef', '爸爸');
  const chefToken = mintSession('member-chef');
  const resp = await fetch(`${baseUrl}/inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chefToken}` },
    body: JSON.stringify({ name: '土豆', quantity: 2, unit: '个', operator: '伪造的人' }),
  });
  assert.equal(resp.status, 201);
  const item = repo.listInventory().find((i) => i.canonical_name === '土豆');
  assert.ok(item, '库存中应已记录土豆');
  assert.equal(item.updated_by, '爸爸');
  const log = repo.db().prepare('SELECT operator FROM inventory_log WHERE item_id = ?').get(item.id);
  assert.equal(log.operator, '爸爸');
});

test('wechat 模式下仅 x-member-id 无法认证，伪造 x-member-id 不覆盖 Bearer', async () => {
  const noToken = await fetch(`${baseUrl}/meals`, {
    headers: { 'x-member-id': 'member-chef' },
  });
  assert.equal(noToken.status, 401);
  assert.equal((await noToken.json()).data.code, 'UNAUTHORIZED');

  setName('member-chef', '爸爸');
  const chefToken = mintSession('member-chef');
  const me = await fetch(`${baseUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${chefToken}`, 'x-member-id': 'member-family' },
  });
  assert.equal(me.status, 200);
  const body = await me.json();
  assert.equal(body.data.member.id, 'member-chef');
  assert.equal(body.data.member.name, '爸爸');
});

test('日历接口返回 year 与 month，匹配请求参数', async () => {
  setName('member-chef', '爸爸');
  const chefToken = mintSession('member-chef');

  const response = await fetch(`${baseUrl}/calendar?year=2026&month=11`, {
    headers: { Authorization: `Bearer ${chefToken}` },
  });
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.data.year, 2026);
  assert.equal(body.data.month, 11);
  assert.ok(Array.isArray(body.data.days), 'days 应为数组');
});
