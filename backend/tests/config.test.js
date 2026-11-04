import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAuthConfig } from '../src/config.js';
import { AppError } from '../src/errors.js';

const valid = {
  nodeEnv: 'production',
  authMode: 'wechat',
  wxAppId: 'wx-app-id',
  wxSecret: 'wx-secret',
  chefBindCode: 'chef-code-12345',
  familyInviteCode: 'family-code-123',
  sessionTtlDays: 30,
};

test('正式环境必须启用微信登录', () => {
  assert.throws(
    () => validateAuthConfig({ ...valid, authMode: 'legacy' }),
    /生产环境必须使用 AUTH_MODE=wechat/,
  );
});

test('微信模式缺少任意必要配置时拒绝启动', () => {
  assert.throws(
    () => validateAuthConfig({ ...valid, wxSecret: '' }),
    /WX_SECRET/,
  );
});

test('绑定口令至少 12 个字符', () => {
  assert.throws(
    () => validateAuthConfig({ ...valid, chefBindCode: 'short' }),
    /CHEF_BIND_CODE/,
  );
});

test('微信模式不得同时启用旧家庭口令', () => {
  assert.throws(
    () => validateAuthConfig({ ...valid, passcode: 'legacy-passcode' }),
    /FAMILY_PASSCODE/,
  );
});

test('有效微信配置通过校验', () => {
  assert.doesNotThrow(() => validateAuthConfig(valid));
});

test('AppError 保留 HTTP 状态和错误码', () => {
  const error = new AppError(403, 'CHEF_ONLY', '只有主厨才能操作');
  assert.equal(error.status, 403);
  assert.equal(error.code, 'CHEF_ONLY');
});
