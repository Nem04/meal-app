import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { AppError } from '../errors.js';

export const MAX_LOG_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_LOG_PHOTOS_PER_MEAL = 3;

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function detectImageMime(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

export function logPhotoDir(dataDir) {
  return join(dataDir, 'uploads', 'log-photos');
}

export function resolveLogPhotoFile(dataDir, fileName) {
  if (!/^[a-f0-9]{32,64}\.(jpg|png|webp)$/.test(fileName)) {
    throw new AppError(404, 'PHOTO_NOT_FOUND', '照片不存在');
  }
  return join(logPhotoDir(dataDir), fileName);
}

export function saveLogPhotoFile({ dataDir, base64, declaredMime }) {
  const buffer = Buffer.from(String(base64 || ''), 'base64');
  if (buffer.length === 0) throw new AppError(400, 'PHOTO_INVALID_CONTENT', '照片内容为空');
  if (buffer.length > MAX_LOG_PHOTO_BYTES) throw new AppError(413, 'PHOTO_TOO_LARGE', '单张照片不能超过 2 MB');
  const detected = detectImageMime(buffer);
  if (!detected || detected !== declaredMime) {
    throw new AppError(400, 'PHOTO_INVALID_CONTENT', '照片内容与格式不匹配');
  }
  const extension = EXTENSIONS[detected];
  if (!extension) throw new AppError(400, 'PHOTO_TYPE_UNSUPPORTED', '不支持这种图片格式');
  const fileName = `${randomBytes(24).toString('hex')}.${extension}`;
  const dir = logPhotoDir(dataDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolveLogPhotoFile(dataDir, fileName), buffer, { mode: 0o600 });
  return { fileName, mimeType: detected, sizeBytes: buffer.length };
}

export function deleteLogPhotoFile({ dataDir, fileName }) {
  try {
    unlinkSync(resolveLogPhotoFile(dataDir, fileName));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
