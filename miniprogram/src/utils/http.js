export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const DEV_BASE_URL = 'http://192.168.5.2:8080';
const PROD_BASE_URL = 'https://api.example.com';

// Node 测试环境中 import.meta.env 为 undefined，使用可选链兜底；
// 生产小程序构建时 import.meta.env.DEV 为 false，从而选择 HTTPS 地址。
const isDev = import.meta.env?.DEV !== false;

export const BASE_URL = isDev ? DEV_BASE_URL : PROD_BASE_URL;

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
