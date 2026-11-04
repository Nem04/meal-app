const TOKEN_KEY = 'family-meal-token';
const MEMBER_KEY = 'family-meal-auth-member';

export function getToken() {
  return uni.getStorageSync(TOKEN_KEY) || '';
}

export function setAuth(token, member) {
  uni.setStorageSync(TOKEN_KEY, token);
  uni.setStorageSync(MEMBER_KEY, JSON.stringify(member));
}

export function clearAuth() {
  uni.removeStorageSync(TOKEN_KEY);
  uni.removeStorageSync(MEMBER_KEY);
}

export function getStoredMember() {
  const raw = uni.getStorageSync(MEMBER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    clearAuth();
    return null;
  }
}
