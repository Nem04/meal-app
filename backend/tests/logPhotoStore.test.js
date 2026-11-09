import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const store = await import('../src/media/logPhotoStore.js');

test('合法 PNG 写入随机文件并可安全删除', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'meal-photo-'));
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const saved = store.saveLogPhotoFile({
    dataDir,
    base64: png.toString('base64'),
    declaredMime: 'image/png',
  });

  assert.equal(saved.mimeType, 'image/png');
  assert.match(saved.fileName, /^[a-f0-9]+\.png$/);
  assert.ok(existsSync(join(dataDir, 'uploads', 'log-photos', saved.fileName)));
  store.deleteLogPhotoFile({ dataDir, fileName: saved.fileName });
  assert.equal(existsSync(join(dataDir, 'uploads', 'log-photos', saved.fileName)), false);
});

test('声明 JPEG 但内容不是图片时拒绝', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'meal-photo-'));
  assert.throws(
    () => store.saveLogPhotoFile({
      dataDir,
      base64: Buffer.from('not an image').toString('base64'),
      declaredMime: 'image/jpeg',
    }),
    (error) => error.code === 'PHOTO_INVALID_CONTENT',
  );
});
