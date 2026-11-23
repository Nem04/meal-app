import { rawRequest, ApiError } from './http.js';
import { getToken, setAuth, clearAuth, getStoredMember } from './token.js';

const SIGNED_OUT_KEY = 'family-meal-signed-out';

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
  uni.removeStorageSync(SIGNED_OUT_KEY);
  return response.data.member;
}

export async function changeRole({ kind, inviteCode }) {
  const token = getToken();
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', '请先登录');
  const response = await rawRequest('/auth/change-role', 'POST', {
    kind,
    inviteCode,
  }, { token });
  setAuth(token, response.data);
  return response.data;
}

export async function refreshMember() {
  const token = getToken();
  if (!token) return null;
  const response = await rawRequest('/auth/me', 'GET', undefined, { token });
  const member = response.data && response.data.member;
  if (member) setAuth(token, member);
  return member || null;
}

let authPromise = null;

export function hasExplicitSignOut() {
  return uni.getStorageSync(SIGNED_OUT_KEY) === '1';
}

function redirectToPage(url) {
  let currentRoute = '';
  try {
    if (typeof getCurrentPages === 'function') {
      const pages = getCurrentPages();
      currentRoute = pages[pages.length - 1]?.route || '';
    }
  } catch {}
  if (currentRoute !== url.replace(/^\//, '')) {
    uni.reLaunch({ url });
  }
}

function redirectToBinding() {
  redirectToPage('/pages/bind/bind');
}

function redirectToSwitchWechat() {
  redirectToPage('/pages/switch-wechat/switch-wechat');
}

function bindRequiredError() {
  return new ApiError(403, 'BIND_REQUIRED', '请先登录');
}

export function bootstrapAuth({ force = false } = {}) {
  if (!force && hasExplicitSignOut()) {
    redirectToSwitchWechat();
    return Promise.reject(bindRequiredError());
  }
  if (!force && getToken() && getStoredMember()) {
    return Promise.resolve(getStoredMember());
  }
  if (authPromise) return authPromise;

  if (force) clearAuth();

  const current = (async () => {
    const result = await loginWithWechat();
    if (result.status !== 'bound') {
      redirectToBinding();
      throw bindRequiredError();
    }
    uni.removeStorageSync(SIGNED_OUT_KEY);
    return result.member;
  })();
  authPromise = current;
  current.then(
    () => { if (authPromise === current) authPromise = null; },
    () => { if (authPromise === current) authPromise = null; },
  );
  return current;
}

export function ensureLogin(force = false) {
  return bootstrapAuth({ force });
}

export async function switchWechatAccount() {
  const token = getToken();
  try {
    if (token) {
      await rawRequest('/auth/logout', 'POST', {}, { token });
    }
  } catch {
    // Local sign-out must still complete if the server is temporarily unavailable.
  } finally {
    clearAuth();
    uni.setStorageSync(SIGNED_OUT_KEY, '1');
  }
}

export function exitMiniProgram() {
  if (typeof wx !== 'undefined' && typeof wx.exitMiniProgram === 'function') {
    wx.exitMiniProgram({
      fail() {
        redirectToSwitchWechat();
      },
    });
    return true;
  }
  redirectToSwitchWechat();
  return false;
}
