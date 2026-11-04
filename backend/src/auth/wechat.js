import { AppError } from '../errors.js';

export function createWechatClient({
  appId,
  appSecret,
  fetchImpl = fetch,
  timeoutMs = 5000,
}) {
  return {
    async exchangeCode(code) {
      if (!code) throw new AppError(401, 'INVALID_LOGIN_CODE', '微信登录凭证无效');
      const params = new URLSearchParams({
        appid: appId,
        secret: appSecret,
        js_code: code,
        grant_type: 'authorization_code',
      });
      let response;
      try {
        response = await fetchImpl(
          `https://api.weixin.qq.com/sns/jscode2session?${params}`,
          { signal: AbortSignal.timeout(timeoutMs) },
        );
      } catch {
        throw new AppError(503, 'WECHAT_LOGIN_FAILED', '微信登录服务暂时不可用');
      }
      let body;
      try {
        body = await response.json();
      } catch {
        throw new AppError(502, 'WECHAT_LOGIN_FAILED', '微信登录响应无法解析');
      }
      if (!response.ok || body.errcode || !body.openid) {
        throw new AppError(401, 'INVALID_LOGIN_CODE', '微信登录凭证无效');
      }
      return { openid: body.openid };
    },
  };
}
