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
  repo.db()
    .prepare("UPDATE meal SET status = 'closed', closed_at = ? WHERE status = 'open'")
    .run(new Date().toISOString());
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

test('多个微信可用同一个主厨码绑定，成员列表只返回已绑定成员', async () => {
  const names = ['主厨甲', '主厨乙'];
  const tokens = [];
  for (let i = 0; i < names.length; i += 1) {
    nextOpenid = `openid-chef-${i}`;
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
        displayName: names[i],
      }),
    });
    const body = await bind.json();
    assert.equal(body.data.member.role, 'chef');
    tokens.push(body.data.token);
  }

  const members = await fetch(`${baseUrl}/members`, {
    headers: { Authorization: `Bearer ${tokens[0]}` },
  });
  const body = await members.json();
  const matching = body.data.filter((m) => names.includes(m.name));
  assert.equal(matching.length, 2);
  assert.deepEqual(matching.map((m) => m.name).sort(), ['主厨乙', '主厨甲'].sort());
  assert.ok(matching.every((m) => m.role === 'chef'));
  assert.ok(
    body.data.every((m) => m.id !== 'member-chef' && m.id !== 'member-family'),
    '成员列表只应返回已绑定成员，不应包含未绑定种子槽位',
  );
});

test('两位成员点同一道菜时保留两条提交审计', async () => {
  const bindAccount = async (openid, kind, inviteCode, displayName) => {
    nextOpenid = openid;
    const login = await fetch(`${baseUrl}/auth/wechat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'good-code' }),
    });
    assert.equal((await login.json()).data.status, 'needs_binding');

    const bind = await fetch(`${baseUrl}/auth/bind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'good-code', kind, inviteCode, displayName }),
    });
    const body = await bind.json();
    assert.equal(bind.status, 200);
    return body.data;
  };

  const chef = await bindAccount(
    'openid-audit-chef-20261105',
    'chef',
    'chef-code-12345',
    '审计主厨甲',
  );
  const family = await bindAccount(
    'openid-audit-family-20261105',
    'family',
    'family-code-123',
    '审计家人乙',
  );
  assert.equal(chef.member.role, 'chef');
  assert.equal(family.member.role, 'member');

  const recipeResp = await fetch(`${baseUrl}/recipes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chef.token}` },
    body: JSON.stringify({
      name: '审计菜谱',
      category: '素',
      steps: '1. 炒熟即可',
      specs: [{ raw_name: '土豆', quantity: 1, unit: '个', note: '' }],
    }),
  });
  assert.equal(recipeResp.status, 201);
  const recipe = (await recipeResp.json()).data;

  const mealResp = await fetch(`${baseUrl}/meals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chef.token}` },
    body: JSON.stringify({ title: '审计饭局', meal_date: '2026-11-05' }),
  });
  assert.equal(mealResp.status, 201);
  const meal = (await mealResp.json()).data;

  const order = async (token, note) => {
    const resp = await fetch(`${baseUrl}/meals/${meal.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ recipe_version_id: recipe.version_id, note }),
    });
    assert.equal(resp.status, 201);
    return (await resp.json()).data;
  };

  await order(chef.token, '主厨点');
  await order(family.token, '家人点');

  const detailResp = await fetch(`${baseUrl}/meals/${meal.id}`, {
    headers: { Authorization: `Bearer ${chef.token}` },
  });
  assert.equal(detailResp.status, 200);
  const detail = (await detailResp.json()).data;
  const submissions = detail.submissions;

  assert.equal(submissions.length, 2);
  assert.equal(new Set(submissions.map((s) => s.member_id)).size, 2);
  assert.deepEqual(
    submissions.map((s) => s.member_id).sort(),
    [chef.member.id, family.member.id].sort(),
  );
  assert.deepEqual(
    submissions.map((s) => s.member_name_snapshot).sort(),
    ['审计主厨甲', '审计家人乙'].sort(),
  );
  assert.ok(submissions.every((s) => s.recipe_version_id === recipe.version_id));
});

test('家人通过 HTTP 输入主厨码升级后获得主厨权限', async () => {
  nextOpenid = 'openid-role-change-20261105';
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
      kind: 'family',
      inviteCode: 'family-code-123',
      displayName: '角色家人甲',
    }),
  });
  const bound = (await bind.json()).data;
  assert.equal(bound.member.role, 'member');

  const changed = await fetch(`${baseUrl}/auth/change-role`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bound.token}`,
    },
    body: JSON.stringify({
      kind: 'chef',
      inviteCode: 'chef-code-12345',
    }),
  });
  assert.equal(changed.status, 200);
  const changedBody = (await changed.json()).data;
  assert.equal(changedBody.role, 'chef');

  const meal = await fetch(`${baseUrl}/meals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bound.token}`,
    },
    body: JSON.stringify({ title: '升级后开饭' }),
  });
  assert.equal(meal.status, 201);
});

test('家人不能删除已点菜品，主厨删除后同步清理备菜', async () => {
  setName('member-chef', '删除主厨');
  setName('member-family', '删除家人');
  const chefToken = mintSession('member-chef');
  const familyToken = mintSession('member-family');

  const mealResp = await fetch(`${baseUrl}/meals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chefToken}` },
    body: JSON.stringify({ title: '删除菜品测试', meal_date: '2026-11-09' }),
  });
  const meal = (await mealResp.json()).data;

  const orderResp = await fetch(`${baseUrl}/meals/${meal.id}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${familyToken}` },
    body: JSON.stringify({ recipe_version_id: 'recipe-seed-001-v1' }),
  });
  assert.equal(orderResp.status, 201);
  const itemId = repo.listMealItems(meal.id)[0].id;

  const denied = await fetch(`${baseUrl}/meals/${meal.id}/items/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${familyToken}` },
  });
  assert.equal(denied.status, 403);
  assert.equal(repo.listMealItems(meal.id).length, 1);

  const deleted = await fetch(`${baseUrl}/meals/${meal.id}/items/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${chefToken}` },
  });
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).data.deleted, true);
  assert.ok(repo.getMeal(meal.id), '删除菜品不应删除整顿饭');
  assert.deepEqual(repo.listMealItems(meal.id), []);
  assert.deepEqual(repo.listMealSubmissions(meal.id), []);
  assert.deepEqual(repo.listPrep(meal.id), []);
});

test('备菜 GET 接口直接返回 dishes 和 entries', async () => {
  setName('member-chef', '备菜主厨');
  const chefToken = mintSession('member-chef');

  const mealResp = await fetch(`${baseUrl}/meals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chefToken}` },
    body: JSON.stringify({ title: '备菜接口测试', meal_date: '2026-11-10' }),
  });
  const meal = (await mealResp.json()).data;

  const orderResp = await fetch(`${baseUrl}/meals/${meal.id}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chefToken}` },
    body: JSON.stringify({ recipe_version_id: 'recipe-seed-001-v1' }),
  });
  assert.equal(orderResp.status, 201);

  const prepResp = await fetch(`${baseUrl}/meals/${meal.id}/prep`, {
    headers: { Authorization: `Bearer ${chefToken}` },
  });
  assert.equal(prepResp.status, 200);
  const prep = (await prepResp.json()).data;
  assert.equal(Array.isArray(prep.dishes), true);
  assert.equal(prep.dishes[0].recipe_name, '番茄炒蛋');
  assert.equal(Array.isArray(prep.entries), true);
  assert.ok(prep.entries.length > 0);
});

test('未知饭局子路径不能误删整顿饭', async () => {
  setName('member-chef', '路径主厨');
  const chefToken = mintSession('member-chef');
  const mealResp = await fetch(`${baseUrl}/meals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chefToken}` },
    body: JSON.stringify({ title: '路由保护测试', meal_date: '2026-11-10' }),
  });
  const meal = (await mealResp.json()).data;

  const response = await fetch(`${baseUrl}/meals/${meal.id}/unknown`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${chefToken}` },
  });

  assert.equal(response.status, 404);
  assert.ok(repo.getMeal(meal.id), '未知子路径不应删除整顿饭');
});

test('家人不能重新生成备菜清单', async () => {
  setName('member-chef', '备菜权限主厨');
  setName('member-family', '备菜权限家人');
  const chefToken = mintSession('member-chef');
  const familyToken = mintSession('member-family');
  const mealResp = await fetch(`${baseUrl}/meals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chefToken}` },
    body: JSON.stringify({ title: '备菜权限测试', meal_date: '2026-11-10' }),
  });
  const meal = (await mealResp.json()).data;

  const response = await fetch(`${baseUrl}/meals/${meal.id}/prep`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${familyToken}` },
  });

  assert.equal(response.status, 403);
});

test('未知菜谱子路径不能误删菜谱', async () => {
  setName('member-chef', '菜谱路径主厨');
  const chefToken = mintSession('member-chef');
  const recipeResp = await fetch(`${baseUrl}/recipes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chefToken}` },
    body: JSON.stringify({ name: '路由保护菜谱', category: '其他', steps: '', specs: [] }),
  });
  const recipe = (await recipeResp.json()).data;

  const response = await fetch(`${baseUrl}/recipes/${recipe.recipe_id}/unknown`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${chefToken}` },
  });

  assert.equal(response.status, 404);
  assert.ok(repo.getRecipe(recipe.recipe_id), '未知子路径不应删除菜谱');
});

test('饭局全流程接口契约：开饭、点菜、备菜、结束、日志和删除', async () => {
  setName('member-chef', '流程主厨');
  setName('member-family', '流程家人');
  const chefToken = mintSession('member-chef');
  const familyToken = mintSession('member-family');
  const chefHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${chefToken}`,
  };
  const familyHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${familyToken}`,
  };

  const mealResp = await fetch(`${baseUrl}/meals`, {
    method: 'POST',
    headers: chefHeaders,
    body: JSON.stringify({ title: '全流程饭局' }),
  });
  assert.equal(mealResp.status, 201);
  const meal = (await mealResp.json()).data;
  const now = new Date();
  const expectedMealDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  assert.equal(meal.meal_date, expectedMealDate);

  const orderResp = await fetch(`${baseUrl}/meals/${meal.id}/items`, {
    method: 'POST',
    headers: familyHeaders,
    body: JSON.stringify({ recipe_version_id: 'recipe-seed-001-v1' }),
  });
  assert.equal(orderResp.status, 201);

  const prepResp = await fetch(`${baseUrl}/meals/${meal.id}/prep`, {
    headers: chefHeaders,
  });
  const prep = (await prepResp.json()).data;
  assert.equal(prep.dishes[0].recipe_name, '番茄炒蛋');

  const toggleResp = await fetch(`${baseUrl}/meals/${meal.id}/prep/${prep.entries[0].id}`, {
    method: 'PATCH',
    headers: chefHeaders,
    body: JSON.stringify({ prepared: true }),
  });
  assert.equal(toggleResp.status, 200);
  assert.equal((await toggleResp.json()).data.prepared, 1);

  const closeResp = await fetch(`${baseUrl}/meals/${meal.id}/close`, {
    method: 'PATCH',
    headers: chefHeaders,
    body: JSON.stringify({}),
  });
  assert.equal(closeResp.status, 200);
  assert.equal((await closeResp.json()).data.status, 'closed');

  const logResp = await fetch(`${baseUrl}/meals/${meal.id}/log`, {
    method: 'POST',
    headers: chefHeaders,
    body: JSON.stringify({ sentence: '这顿不错', rating: '好吃' }),
  });
  assert.equal(logResp.status, 201);

  const getLogResp = await fetch(`${baseUrl}/meals/${meal.id}/log`, {
    headers: chefHeaders,
  });
  assert.equal(getLogResp.status, 200);
  assert.equal((await getLogResp.json()).data.sentence, '这顿不错');

  const [calendarYear, calendarMonth] = meal.meal_date.split('-').map(Number);
  const calendarResp = await fetch(`${baseUrl}/calendar?year=${calendarYear}&month=${calendarMonth}`, {
    headers: chefHeaders,
  });
  const calendar = (await calendarResp.json()).data;
  assert.ok(calendar.days.some((day) => day.id === meal.id));

  const deleteResp = await fetch(`${baseUrl}/meals/${meal.id}`, {
    method: 'DELETE',
    headers: chefHeaders,
  });
  assert.equal(deleteResp.status, 200);
  assert.equal(repo.getMeal(meal.id), undefined);
  assert.equal(repo.getMealLog(meal.id), undefined);
});

test('菜谱全流程接口契约：新建、另存、编辑、读取和删除', async () => {
  setName('member-chef', '菜谱流程主厨');
  const chefToken = mintSession('member-chef');
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${chefToken}`,
  };

  const createResp = await fetch(`${baseUrl}/recipes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: '接口测试菜谱',
      category: '其他',
      steps: '第一步',
      specs: [{ raw_name: '土豆', quantity: 1, unit: '个' }],
    }),
  });
  assert.equal(createResp.status, 201);
  const created = (await createResp.json()).data;

  const forkResp = await fetch(`${baseUrl}/recipes/x/versions/${created.version_id}/fork`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  assert.equal(forkResp.status, 201);
  const forked = (await forkResp.json()).data;

  const updateResp = await fetch(`${baseUrl}/recipes/x/versions/${forked.version_id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      steps: '第二步',
      specs: [{ raw_name: '土豆', quantity: 2, unit: '个' }],
    }),
  });
  assert.equal(updateResp.status, 200);

  const detailResp = await fetch(`${baseUrl}/recipes/${created.recipe_id}`, {
    headers,
  });
  assert.equal(detailResp.status, 200);
  const detail = (await detailResp.json()).data;
  assert.equal(detail.current_version.id, forked.version_id);
  assert.equal(detail.specs[0].quantity, 2);

  const deleteResp = await fetch(`${baseUrl}/recipes/${created.recipe_id}`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(deleteResp.status, 200);
  assert.equal(repo.getRecipe(created.recipe_id), undefined);
});

test('库存接口契约：批量录入、改库存和删除', async () => {
  setName('member-chef', '库存流程主厨');
  const chefToken = mintSession('member-chef');
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${chefToken}`,
  };

  const bulkResp = await fetch(`${baseUrl}/inventory/bulk`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: '芹菜一斤，鸡蛋十个' }),
  });
  assert.equal(bulkResp.status, 201);
  const bulk = (await bulkResp.json()).data;
  assert.equal(bulk.saved.length, 2);

  const listResp = await fetch(`${baseUrl}/inventory`, { headers });
  const list = (await listResp.json()).data;
  const celery = list.find((item) => item.canonical_name === '芹菜');
  assert.ok(celery);

  const updateResp = await fetch(`${baseUrl}/inventory/${celery.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ op: 'stocktake', quantity: 3 }),
  });
  assert.equal(updateResp.status, 200);
  assert.equal((await updateResp.json()).data.quantity, 3);

  const deleteResp = await fetch(`${baseUrl}/inventory/${celery.id}`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(deleteResp.status, 200);
  assert.equal(repo.listInventory().some((item) => item.id === celery.id), false);
});
