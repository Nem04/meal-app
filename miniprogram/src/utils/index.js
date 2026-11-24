import { rawRequest, ApiError } from './http.js';
import { clearAuth, getToken } from './token.js';
import { getMember } from './auth.js';

export { getMember, ApiError };

export async function request(path, method = 'GET', body, options = {}) {
  try {
    const response = await rawRequest(path, method, body, { token: getToken() });
    return response.data;
  } catch (error) {
    if (error.status === 401 && getToken()) {
      clearAuth();
    }
    throw error;
  }
}

export function toast(title) {
  uni.showToast({ title, icon: 'none', duration: 1800 });
}
