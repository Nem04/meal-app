import { AppError } from '../errors.js';

export function bearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', '请先登录');
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) throw new AppError(401, 'UNAUTHORIZED', '请先登录');
  return token;
}
