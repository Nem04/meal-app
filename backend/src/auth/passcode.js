import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from '../errors.js';

function digest(value) {
  return createHash('sha256').update(String(value || '')).digest();
}

export function verifyBindCode(kind, provided, appConfig) {
  if (kind !== 'chef' && kind !== 'family') {
    throw new AppError(400, 'INVALID_BIND_KIND', '绑定类型无效');
  }
  const expected = kind === 'chef'
    ? appConfig.chefBindCode
    : appConfig.familyInviteCode;
  if (!expected || !timingSafeEqual(digest(provided), digest(expected))) {
    throw new AppError(403, 'INVALID_INVITE_CODE', '绑定口令不正确');
  }
}
