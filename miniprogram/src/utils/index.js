import { rawRequest, ApiError } from './http.js';
import { getToken } from './token.js';
import { ensureLogin, getMember } from './auth.js';

export { getMember, ApiError };

export async function request(path, method = 'GET', body, options = {}) {
  try {
    const response = await rawRequest(path, method, body, { token: getToken() });
    return response.data;
  } catch (error) {
    if (error.status === 401 && !options.retried) {
      await ensureLogin(true);
      return request(path, method, body, { ...options, retried: true });
    }
    throw error;
  }
}

export function toast(title) {
  uni.showToast({ title, icon: 'none', duration: 1800 });
}
