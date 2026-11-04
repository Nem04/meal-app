export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function getBaseUrlForPlatform() {
  try {
    return uni.getSystemInfoSync().platform === 'devtools'
      ? 'http://localhost:8080'
      : 'http://192.168.5.2:8080';
  } catch {
    return 'http://192.168.5.2:8080';
  }
}

export const BASE_URL = getBaseUrlForPlatform();

export function rawRequest(path, method = 'GET', body, options = {}) {
  const url = BASE_URL + (path.startsWith('/api') ? path : `/api${path}`);
  const header = { 'Content-Type': 'application/json' };
  if (options.token) header.Authorization = `Bearer ${options.token}`;
  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method,
      data: body,
      header,
      success(res) {
        const payload = res.data;
        if (res.statusCode >= 200 && res.statusCode < 300 && payload && payload.ok) {
          resolve({ data: payload.data, statusCode: res.statusCode });
          return;
        }
        reject(new ApiError(
          res.statusCode,
          payload && payload.data && payload.data.code,
          (payload && payload.data && payload.data.error) || `请求失败(${res.statusCode})`,
        ));
      },
      fail(error) {
        reject(new ApiError(0, 'NETWORK_ERROR', error.errMsg || '网络错误'));
      },
    });
  });
}
