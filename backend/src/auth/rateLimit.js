import { AppError } from '../errors.js';

export function createAttemptLimiter({
  limit = 5,
  windowMs = 15 * 60 * 1000,
  now = Date.now,
} = {}) {
  const buckets = new Map();
  function current(key) {
    const entry = buckets.get(key);
    if (!entry || entry.resetAt <= now()) {
      const fresh = { count: 0, resetAt: now() + windowMs };
      buckets.set(key, fresh);
      return fresh;
    }
    return entry;
  }
  return {
    assertAllowed(key) {
      if (current(key).count >= limit) {
        throw new AppError(429, 'TOO_MANY_ATTEMPTS', '绑定失败次数过多，请稍后再试');
      }
    },
    recordFailure(key) {
      current(key).count += 1;
    },
    clear(key) {
      buckets.delete(key);
    },
  };
}
