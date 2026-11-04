import { createHash, randomBytes } from 'node:crypto';

export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionExpiresAt(days, now = Date.now()) {
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}
