import { rawRequest, ApiError } from './http.js';
import { getToken, setAuth, clearAuth, getStoredMember } from './token.js';

export function getMember() {
  return getStoredMember();
}

export function getTokenValue() {
  return getToken();
}

export function setAuthForTest(token, member) {
  setAuth(token, member);
}

export function wxLogin() {
  return new Promise((resolve, reject) => {
    uni.login({
      success(result) {
        if (result.code) resolve(result.code);
        else reject(new ApiError(401, 'INVALID_LOGIN_CODE', '无法获取微信登录凭证'));
      },
      fail(error) {
        reject(new ApiError(0, 'WECHAT_LOGIN_FAILED', error.errMsg || '微信登录失败'));
      },
    });
  });
}

export async function loginWithWechat() {
  const code = await wxLogin();
  const response = await rawRequest('/auth/wechat', 'POST', { code });
  const result = response.data;
  if (result.status === 'bound') {
    setAuth(result.token, result.member);
    return result;
  }
  clearAuth();
  return result;
}

export async function bindWechatMember({ kind, inviteCode, displayName }) {
  const code = await wxLogin();
  const response = await rawRequest('/auth/bind', 'POST', {
    code,
    kind,
    inviteCode,
    displayName,
  });
  setAuth(response.data.token, response.data.member);
  return response.data.member;
}

export async function ensureLogin(force = false) {
  if (!force && getToken() && getStoredMember()) {
    return getStoredMember();
  }
  const result = await loginWithWechat();
  if (result.status !== 'bound') {
    uni.reLaunch({ url: '/pages/bind/bind' });
    throw new ApiError(403, 'BIND_REQUIRED', '需要绑定家庭成员');
  }
  return result.member;
}
