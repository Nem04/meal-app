import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const store = await import('../src/media/logPhotoStore.js');

const TWO_MIB = 2 * 1024 * 1024;
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const JPEG_1X1 = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8Qf//Z',
  'base64',
);
const WEBP_1X1 = Buffer.from(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
  'base64',
);
const GIF_1X1 = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

function makeDataDir(t) {
  const dataDir = mkdtempSync(join(tmpdir(), 'meal-photo-'));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  return dataDir;
}

function assertPhotoError(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}

function pngOfSize(size) {
  const buffer = Buffer.alloc(size);
  PNG_1X1.copy(buffer);
  return buffer;
}

test('合法 PNG 写入随机文件并可安全删除', (t) => {
  const dataDir = makeDataDir(t);
  const saved = store.saveLogPhotoFile({
    dataDir,
    base64: PNG_1X1.toString('base64'),
    declaredMime: 'image/png',
  });

  assert.equal(saved.mimeType, 'image/png');
  assert.equal(saved.sizeBytes, PNG_1X1.length);
  assert.match(saved.fileName, /^[a-f0-9]{48}\.png$/);
  assert.ok(existsSync(join(dataDir, 'uploads', 'log-photos', saved.fileName)));
  store.deleteLogPhotoFile({ dataDir, fileName: saved.fileName });
  assert.equal(existsSync(join(dataDir, 'uploads', 'log-photos', saved.fileName)), false);
});

test('路径穿越文件名被拒绝', (t) => {
  const dataDir = makeDataDir(t);
  for (const fileName of ['../../etc/passwd', '..\\..\\win.txt']) {
    assertPhotoError(() => store.resolveLogPhotoFile(dataDir, fileName), 'PHOTO_NOT_FOUND');
  }
});

test('恰好 2 MiB 的 PNG 可以保存', (t) => {
  const dataDir = makeDataDir(t);
  const saved = store.saveLogPhotoFile({
    dataDir,
    base64: pngOfSize(TWO_MIB).toString('base64'),
    declaredMime: 'image/png',
  });

  assert.equal(saved.sizeBytes, TWO_MIB);
  assert.match(saved.fileName, /^[a-f0-9]{48}\.png$/);
});

test('超过 2 MiB 的 PNG 被拒绝', (t) => {
  const dataDir = makeDataDir(t);
  assertPhotoError(
    () => store.saveLogPhotoFile({
      dataDir,
      base64: pngOfSize(TWO_MIB + 1).toString('base64'),
      declaredMime: 'image/png',
    }),
    'PHOTO_TOO_LARGE',
  );
  assert.equal(existsSync(join(dataDir, 'uploads')), false);
});

test('声明 JPEG 但内容是 PNG 时拒绝', (t) => {
  const dataDir = makeDataDir(t);
  assertPhotoError(
    () => store.saveLogPhotoFile({
      dataDir,
      base64: PNG_1X1.toString('base64'),
      declaredMime: 'image/jpeg',
    }),
    'PHOTO_INVALID_CONTENT',
  );
});

test('声明 GIF 类型时返回不支持的图片类型', (t) => {
  const dataDir = makeDataDir(t);
  assertPhotoError(
    () => store.saveLogPhotoFile({
      dataDir,
      base64: GIF_1X1.toString('base64'),
      declaredMime: 'image/gif',
    }),
    'PHOTO_TYPE_UNSUPPORTED',
  );
});

test('空 base64 内容被拒绝', (t) => {
  const dataDir = makeDataDir(t);
  assertPhotoError(
    () => store.saveLogPhotoFile({
      dataDir,
      base64: '',
      declaredMime: 'image/jpeg',
    }),
    'PHOTO_INVALID_CONTENT',
  );
});

test('删除不存在的合法照片文件是幂等的', (t) => {
  const dataDir = makeDataDir(t);
  assert.doesNotThrow(() => store.deleteLogPhotoFile({
    dataDir,
    fileName: `${'0'.repeat(48)}.png`,
  }));
});

test('声明 JPEG 但内容不是图片时拒绝', (t) => {
  const dataDir = makeDataDir(t);
  assertPhotoError(
    () => store.saveLogPhotoFile({
      dataDir,
      base64: Buffer.from('not an image').toString('base64'),
      declaredMime: 'image/jpeg',
    }),
    'PHOTO_INVALID_CONTENT',
  );
});

for (const { label, buffer, mimeType, extension } of [
  { label: 'JPEG', buffer: JPEG_1X1, mimeType: 'image/jpeg', extension: 'jpg' },
  { label: 'WebP', buffer: WEBP_1X1, mimeType: 'image/webp', extension: 'webp' },
]) {
  test(`${label} 内容被识别并写入存储`, (t) => {
    const dataDir = makeDataDir(t);
    const saved = store.saveLogPhotoFile({
      dataDir,
      base64: buffer.toString('base64'),
      declaredMime: mimeType,
    });

    assert.equal(saved.mimeType, mimeType);
    assert.equal(saved.sizeBytes, buffer.length);
    assert.match(saved.fileName, new RegExp(`^[a-f0-9]{48}\\.${extension}$`));
    assert.ok(existsSync(join(dataDir, 'uploads', 'log-photos', saved.fileName)));
  });
}
