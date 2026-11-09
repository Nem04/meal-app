import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const env = process.env;

const __dirname = dirname(fileURLToPath(import.meta.url));

// DB、照片存储与备份脚本共用同一个数据目录默认值。
export const DEFAULT_DATA_DIR = join(__dirname, '..', '..', 'data');

export const config = {
  port: Number(env.PORT || 8080),
  host: env.HOST || '0.0.0.0',
  dataDir: env.DATA_DIR || DEFAULT_DATA_DIR,
  passcode: env.FAMILY_PASSCODE || '',
  nodeEnv: env.NODE_ENV || 'development',
  authMode: env.AUTH_MODE || 'legacy',
  wxAppId: env.WX_APPID || '',
  wxSecret: env.WX_SECRET || '',
  chefBindCode: env.CHEF_BIND_CODE || '',
  familyInviteCode: env.FAMILY_INVITE_CODE || '',
  sessionTtlDays: Number(env.SESSION_TTL_DAYS || 30),
};

function isPlaceholder(value) {
  return /^replace-with-/i.test((value || '').trim());
}

export function validateAuthConfig(value = config) {
  if (value.nodeEnv === 'production' && value.authMode !== 'wechat') {
    throw new Error('生产环境必须使用 AUTH_MODE=wechat');
  }
  if (value.authMode !== 'wechat') return;
  if (value.passcode) {
    throw new Error('AUTH_MODE=wechat 时请移除 FAMILY_PASSCODE');
  }

  const required = [
    ['WX_APPID', value.wxAppId],
    ['WX_SECRET', value.wxSecret],
    ['CHEF_BIND_CODE', value.chefBindCode],
    ['FAMILY_INVITE_CODE', value.familyInviteCode],
  ];
  const missing = required.filter(([, item]) => !item).map(([key]) => key);
  if (missing.length) {
    throw new Error(`微信登录缺少配置：${missing.join(', ')}`);
  }
  const placeholders = required.filter(([, item]) => isPlaceholder(item)).map(([key]) => key);
  if (placeholders.length) {
    throw new Error(`检测到未替换的占位配置：${placeholders.join(', ')}`);
  }
  if (value.chefBindCode.length < 12) {
    throw new Error('CHEF_BIND_CODE 至少需要 12 个字符');
  }
  if (value.familyInviteCode.length < 12) {
    throw new Error('FAMILY_INVITE_CODE 至少需要 12 个字符');
  }
  if (!Number.isInteger(value.sessionTtlDays) || value.sessionTtlDays <= 0) {
    throw new Error('SESSION_TTL_DAYS 必须是正整数');
  }
}
