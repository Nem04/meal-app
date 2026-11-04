import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
let requestResponses = [];
let loginCalls = 0;
let reLaunchCalls = 0;

globalThis.uni = {
  getSystemInfoSync: () => ({ platform: 'devtools' }),
  getStorageSync: (key) => storage.get(key) || '',
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: (key) => storage.delete(key),
  login: ({ success }) => {
    loginCalls += 1;
    success({ code: `code-${loginCalls}` });
  },
  reLaunch: () => { reLaunchCalls += 1; },
  request: ({ success }) => {
    success(requestResponses.shift());
  },
  showToast: () => {},
};

beforeEach(() => {
  storage.clear();
  requestResponses = [];
  loginCalls = 0;
  reLaunchCalls = 0;
});

const auth = await import('../src/utils/auth.js');

test('已绑定微信登录保存 token 和成员', async () => {
  requestResponses.push({
    statusCode: 200,
    data: {
      ok: true,
      data: {
        status: 'bound',
        token: 'token-1',
        member: {
          id: 'member-chef',
          name: '爸爸',
          role: 'chef',
          color: '#D96A3B',
        },
      },
    },
  });
  const result = await auth.loginWithWechat();
  assert.equal(result.status, 'bound');
  assert.equal(auth.getTokenValue(), 'token-1');
  assert.equal(auth.getMember().role, 'chef');
});

test('未绑定微信登录跳转绑定页', async () => {
  requestResponses.push({
    statusCode: 200,
    data: { ok: true, data: { status: 'needs_binding' } },
  });
  await assert.rejects(
    () => auth.ensureLogin(true),
    (error) => error.code === 'BIND_REQUIRED',
  );
  assert.equal(reLaunchCalls, 1);
});

test('已有 token 时 ensureLogin 不重复请求微信登录', async () => {
  auth.setAuthForTest('token-existing', {
    id: 'member-family',
    name: '妈妈',
    role: 'member',
    color: '#5B8C5A',
  });
  const member = await auth.ensureLogin();
  assert.equal(member.id, 'member-family');
  assert.equal(loginCalls, 0);
});
