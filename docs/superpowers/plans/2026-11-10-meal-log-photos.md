# Meal Log Photos V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add up to three camera/album photos to each meal log, persist them on the server, show them in log details, and clean them up on deletion.

**Architecture:** Store photo metadata in SQLite and image bytes in `$DATA_DIR/uploads/log-photos`. Upload compressed images as Base64 JSON, serve files through unpredictable file names, and use a dedicated `log-edit` mini-program page for text plus photo selection.

**Tech Stack:** Node.js 24, `node:sqlite`, vanilla HTTP server, uni-app Vue 3 mini program, Docker bind-mounted data directory.

**Spec:** `docs/superpowers/specs/2026-11-10-meal-log-photos-design.md`

## Global Constraints

- Maximum 3 photos per meal.
- Maximum 2 MB per decoded image.
- Maximum 3 MB per upload request body.
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`.
- Store photos under `$DATA_DIR/uploads/log-photos/`.
- Use random file names; never use browser-provided file names as paths.
- Any logged-in family member may list and upload photos.
- Uploader or chef may delete a photo.
- Deleting a meal removes its photo metadata and files.
- Existing Docker bind mount `./data:/app/data` is the persistence boundary.

---

### Task 1: Add Photo Metadata Storage

**Files:**
- Modify: `backend/src/schema.sql`
- Modify: `backend/src/repo.js`
- Test: `backend/tests/photoRepo.test.js`

**Interfaces:**
- Produces:
  - `repo.insertMealLogPhoto({ id, mealId, fileName, mimeType, sizeBytes, createdById, createdByName, createdAt })`
  - `repo.countMealLogPhotos(mealId): number`
  - `repo.listMealLogPhotos(mealId): Array<{ id, meal_id, file_name, mime_type, size_bytes, created_by_id, created_by_name, created_at }>`
  - `repo.getMealLogPhoto(mealId, photoId)`
  - `repo.deleteMealLogPhoto(mealId, photoId): number`
  - Calendar rows include `photo_count`.

- [ ] **Step 1: Write the failing repository test**

```js
import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_DIR = ':memory:';
const repo = await import('../src/repo.js');
const dbm = await import('../src/db.js');

before(() => { dbm.openDb(); });
afterEach(() => { dbm.closeDbForTest(); });

test('照片元数据可以按饭局写入、读取和删除', () => {
  const mealId = repo.insertMeal('有照片的饭', '2026-11-10', '主厨');
  repo.insertMealLogPhoto({
    id: 'photo-1',
    mealId,
    fileName: 'random-1.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    createdById: 'member-chef',
    createdByName: '主厨',
    createdAt: '2026-11-10T00:00:00.000Z',
  });

  assert.equal(repo.countMealLogPhotos(mealId), 1);
  assert.equal(repo.listMealLogPhotos(mealId)[0].file_name, 'random-1.jpg');
  assert.equal(repo.getMealLogPhoto(mealId, 'photo-1').created_by_id, 'member-chef');
  assert.equal(repo.deleteMealLogPhoto(mealId, 'photo-1'), 1);
  assert.equal(repo.countMealLogPhotos(mealId), 0);
});
```

- [ ] **Step 2: Run it and verify RED**

Run: `node --test tests/photoRepo.test.js`

Expected: FAIL because `insertMealLogPhoto` and the table do not exist.

- [ ] **Step 3: Implement schema and repository functions**

Add to `backend/src/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS meal_log_photo (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL REFERENCES meal(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meal_log_photo_meal
ON meal_log_photo(meal_id);
```

Add repository functions in `backend/src/repo.js`:

```js
export function insertMealLogPhoto({
  id, mealId, fileName, mimeType, sizeBytes, createdById, createdByName, createdAt,
}) {
  db().prepare(
    'INSERT INTO meal_log_photo(id,meal_id,file_name,mime_type,size_bytes,created_by_id,created_by_name,created_at) VALUES(?,?,?,?,?,?,?,?)'
  ).run(id, mealId, fileName, mimeType, sizeBytes, createdById, createdByName, createdAt);
}

export function countMealLogPhotos(mealId) {
  return db().prepare('SELECT COUNT(*) AS n FROM meal_log_photo WHERE meal_id = ?').get(mealId).n;
}

export function listMealLogPhotos(mealId) {
  return db().prepare(
    'SELECT id,meal_id,file_name,mime_type,size_bytes,created_by_id,created_by_name,created_at FROM meal_log_photo WHERE meal_id = ? ORDER BY created_at ASC'
  ).all(mealId);
}

export function getMealLogPhoto(mealId, photoId) {
  return db().prepare('SELECT * FROM meal_log_photo WHERE meal_id = ? AND id = ?').get(mealId, photoId);
}

export function deleteMealLogPhoto(mealId, photoId) {
  return db().prepare('DELETE FROM meal_log_photo WHERE meal_id = ? AND id = ?').run(mealId, photoId).changes;
}
```

Update `mealsForMonth` to include `photo_count`:

```sql
(SELECT COUNT(*) FROM meal_log_photo p WHERE p.meal_id = m.id) AS photo_count
```

- [ ] **Step 4: Run repository and full backend tests**

Run: `node --test tests/photoRepo.test.js`

Expected: PASS.

Run: `npm test`

Expected: all existing backend tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/schema.sql backend/src/repo.js backend/tests/photoRepo.test.js
git commit -m "feat: add meal log photo metadata"
```

---

### Task 2: Add Safe Photo File Storage

**Files:**
- Create: `backend/src/media/logPhotoStore.js`
- Test: `backend/tests/logPhotoStore.test.js`

**Interfaces:**
- Produces:
  - `MAX_LOG_PHOTO_BYTES = 2 * 1024 * 1024`
  - `MAX_LOG_PHOTOS_PER_MEAL = 3`
  - `detectImageMime(buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null`
  - `saveLogPhotoFile({ dataDir, base64, declaredMime }): { fileName, mimeType, sizeBytes }`
  - `deleteLogPhotoFile({ dataDir, fileName }): void`
  - `resolveLogPhotoFile(dataDir, fileName): string`

- [ ] **Step 1: Write failing file-storage tests**

```js
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
```

- [ ] **Step 2: Run it and verify RED**

Run: `node --test tests/logPhotoStore.test.js`

Expected: FAIL because `logPhotoStore.js` does not exist.

- [ ] **Step 3: Implement minimal storage module**

Create `backend/src/media/logPhotoStore.js` with:

```js
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
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/logPhotoStore.test.js`

Expected: PASS.

Run: `npm test`

Expected: all backend tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/media/logPhotoStore.js backend/tests/logPhotoStore.test.js
git commit -m "feat: add safe meal photo file storage"
```

---

### Task 3: Add Photo Service and HTTP Interfaces

**Files:**
- Modify: `backend/src/services.js`
- Modify: `backend/src/routes.js`
- Modify: `backend/src/http.js`
- Modify: `backend/src/server.js`
- Test: `backend/tests/photoService.test.js`
- Test: `backend/tests/photoHttp.test.js`

**Interfaces:**
- Consumes: Task 1 repository CRUD and Task 2 file storage.
- Produces:
  - `svc.listMealLogPhotos(mealId)`
  - `svc.addMealLogPhoto({ meal_id, base64, mimeType, member, dataDir })`
  - `svc.deleteMealLogPhoto({ meal_id, photo_id, member, dataDir })`
  - `readBody(req, maxBytes)`
  - `serveLogPhotoFile(pathname, res, dataDir)`

- [ ] **Step 1: Write failing service tests**

```js
test('每顿饭最多保存三张照片', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'meal-photo-'));
  const meal = svc.openMeal({ title: '照片饭', meal_date: '2026-11-10', created_by: '主厨' });
  const member = { id: 'member-chef', name: '主厨', role: 'chef' };
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');

  for (let index = 0; index < 3; index += 1) {
    svc.addMealLogPhoto({ meal_id: meal.id, base64: png, mimeType: 'image/png', member, dataDir });
  }
  assert.throws(
    () => svc.addMealLogPhoto({ meal_id: meal.id, base64: png, mimeType: 'image/png', member, dataDir }),
    (error) => error.code === 'PHOTO_LIMIT_EXCEEDED',
  );
  assert.equal(svc.listMealLogPhotos(meal.id).length, 3);
});
```

```js
test('照片只能由上传者本人或主厨删除', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'meal-photo-delete-'));
  const meal = svc.openMeal({ title: '删除照片', meal_date: '2026-11-10', created_by: '主厨' });
  const uploader = { id: 'member-family', name: '妈妈', role: 'member' };
  const other = { id: 'member-other', name: '家人乙', role: 'member' };
  const chef = { id: 'member-chef', name: '主厨', role: 'chef' };
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
  const photo = svc.addMealLogPhoto({ meal_id: meal.id, base64: png, mimeType: 'image/png', member: uploader, dataDir });

  assert.throws(
    () => svc.deleteMealLogPhoto({ meal_id: meal.id, photo_id: photo.id, member: other, dataDir }),
    (error) => error.code === 'FORBIDDEN',
  );
  assert.equal(svc.deleteMealLogPhoto({ meal_id: meal.id, photo_id: photo.id, member: chef, dataDir }).deleted, true);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/photoService.test.js`

Expected: FAIL because photo service functions do not exist.

- [ ] **Step 3: Implement service functions**

Add imports in `backend/src/services.js`:

```js
import { uuid } from './util.js';
import {
  MAX_LOG_PHOTOS_PER_MEAL,
  saveLogPhotoFile,
  deleteLogPhotoFile,
} from './media/logPhotoStore.js';
```

Implement:

```js
export function listMealLogPhotos(mealId) {
  return repo.listMealLogPhotos(mealId).map((photo) => ({
    id: photo.id,
    url: `/media/log-photos/${photo.file_name}`,
    mimeType: photo.mime_type,
    sizeBytes: photo.size_bytes,
    createdAt: photo.created_at,
    createdBy: photo.created_by_name,
    createdById: photo.created_by_id,
  }));
}

export function addMealLogPhoto({ meal_id, base64, mimeType, member, dataDir }) {
  const meal = repo.getMeal(meal_id);
  if (!meal) throw new AppError(404, 'MEAL_NOT_FOUND', '这顿饭不存在');
  if (repo.countMealLogPhotos(meal_id) >= MAX_LOG_PHOTOS_PER_MEAL) {
    throw new AppError(409, 'PHOTO_LIMIT_EXCEEDED', '每顿饭最多 3 张照片');
  }
  const saved = saveLogPhotoFile({ dataDir, base64, declaredMime: mimeType });
  const id = uuid();
  try {
    repo.insertMealLogPhoto({
      id,
      mealId: meal_id,
      fileName: saved.fileName,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      createdById: member.id,
      createdByName: member.name,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    deleteLogPhotoFile({ dataDir, fileName: saved.fileName });
    throw error;
  }
  return { id, url: `/media/log-photos/${saved.fileName}`, mimeType: saved.mimeType, sizeBytes: saved.sizeBytes };
}

export function deleteMealLogPhoto({ meal_id, photo_id, member, dataDir }) {
  const photo = repo.getMealLogPhoto(meal_id, photo_id);
  if (!photo) throw new AppError(404, 'PHOTO_NOT_FOUND', '照片不存在');
  if (member.role !== 'chef' && member.id !== photo.created_by_id) {
    throw new AppError(403, 'FORBIDDEN', '只能删除自己上传的照片');
  }
  repo.deleteMealLogPhoto(meal_id, photo_id);
  deleteLogPhotoFile({ dataDir, fileName: photo.file_name });
  return { deleted: true, photo_id };
}
```

- [ ] **Step 4: Add failing HTTP tests**

Add `backend/tests/photoHttp.test.js` covering:

- authenticated `GET /meals/:id/log/photos` returns `{ photos: [] }`;
- valid PNG upload returns 201 and `/media/log-photos/...png`;
- uploader can delete the photo;
- unsupported MIME returns `PHOTO_INVALID_CONTENT`;
- a request body above 3 MB returns `PAYLOAD_TOO_LARGE`;
- `GET /media/log-photos/:fileName` returns the image bytes.

Run: `node --test tests/photoHttp.test.js`

Expected: FAIL with 404 because routes are missing.

- [ ] **Step 5: Implement routes and file serving**

In `backend/src/routes.js`, add before generic meal GET/DELETE:

```js
if (id && seg[2] === 'log' && seg[3] === 'photos' && !seg[4] && method === 'GET') {
  return ok(res, { photos: svc.listMealLogPhotos(id) });
}
if (id && seg[2] === 'log' && seg[3] === 'photos' && !seg[4] && method === 'POST') {
  const body = await readBody(req, 3 * 1024 * 1024);
  return created(res, svc.addMealLogPhoto({
    meal_id: id,
    base64: body.data,
    mimeType: body.mimeType,
    member: req.member,
    dataDir: config.dataDir,
  }));
}
if (id && seg[2] === 'log' && seg[3] === 'photos' && seg[4] && method === 'DELETE') {
  return ok(res, svc.deleteMealLogPhoto({
    meal_id: id,
    photo_id: seg[4],
    member: req.member,
    dataDir: config.dataDir,
  }));
}
```

Change `readBody` to enforce the injected byte limit and throw:

```js
throw new AppError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大');
```

In `backend/src/http.js`, add `serveLogPhotoFile(pathname, res, dataDir)` using Task 2 `resolveLogPhotoFile`, `createReadStream`, and explicit PNG/WebP/JPEG content types with `Cache-Control: private, max-age=3600`.

In `backend/src/server.js`, handle `/media/log-photos/` before the static fallback:

```js
if (pathname.startsWith('/media/log-photos/')) {
  serveLogPhotoFile(pathname, res, config.dataDir);
  return;
}
```

- [ ] **Step 6: Run tests and commit**

Run: `node --test tests/photoService.test.js tests/photoHttp.test.js`

Expected: PASS.

Run: `npm test`

Expected: all backend tests pass.

```bash
git add backend/src/services.js backend/src/routes.js backend/src/http.js backend/src/server.js backend/tests/photoService.test.js backend/tests/photoHttp.test.js
git commit -m "feat: add meal log photo APIs"
```

---

### Task 4: Clean Up Photos and Include Them in Backups

**Files:**
- Modify: `backend/src/services.js`
- Modify: `backend/src/routes.js`
- Modify: `backend/scripts/backup.js`
- Test: `backend/tests/photoService.test.js`

**Interfaces:**
- Consumes: Task 1 photo metadata and Task 2 file deletion.
- Produces:
  - `svc.deleteMeal(mealId, dataDir)` removes meal photo files.
  - Backup directory contains `uploads-<timestamp>/`.

- [ ] **Step 1: Write the failing cleanup test**

```js
test('删除饭局时同时删除照片文件', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'meal-photo-cleanup-'));
  const meal = svc.openMeal({ title: '删照片', meal_date: '2026-11-10', created_by: '主厨' });
  const member = { id: 'member-chef', name: '主厨', role: 'chef' };
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
  const photo = svc.addMealLogPhoto({ meal_id: meal.id, base64: png, mimeType: 'image/png', member, dataDir });
  const fileName = photo.url.split('/').pop();
  const filePath = join(dataDir, 'uploads', 'log-photos', fileName);

  assert.ok(existsSync(filePath));
  svc.deleteMeal(meal.id, dataDir);
  assert.equal(existsSync(filePath), false);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/photoService.test.js`

Expected: FAIL because `deleteMeal` does not remove the image file.

- [ ] **Step 3: Implement cleanup**

```js
export function deleteMeal(mealId, dataDir) {
  const meal = repo.getMeal(mealId);
  if (!meal) throw new Error('这顿饭不存在');
  const photos = repo.listMealLogPhotos(mealId);
  const changes = repo.deleteMeal(mealId);
  for (const photo of photos) {
    try {
      deleteLogPhotoFile({ dataDir, fileName: photo.file_name });
    } catch {
      console.error(`删除照片文件失败: ${photo.file_name}`);
    }
  }
  return { deleted: changes > 0, meal_id: mealId };
}
```

Update the meal delete route to pass `config.dataDir`.

- [ ] **Step 4: Update backup script**

Add `cpSync` from `node:fs` and, after generating the SQLite snapshot:

```js
const uploadsDir = join(dataDir, 'uploads');
const uploadsBackupDir = join(dataDir, 'backups', `uploads-${stamp}`);
if (existsSync(uploadsDir)) {
  cpSync(uploadsDir, uploadsBackupDir, { recursive: true });
}
```

Prune both database backups and `uploads-*` directories to the latest 30 entries.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/photoService.test.js`

Expected: PASS.

Run: `npm test`

Expected: all backend tests pass.

```bash
git add backend/src/services.js backend/src/routes.js backend/scripts/backup.js backend/tests/photoService.test.js
git commit -m "fix: clean up and back up meal photos"
```

---

### Task 5: Add Mini Program Photo API Helpers

**Files:**
- Create: `miniprogram/src/utils/photo-actions.js`
- Test: `miniprogram/tests/photo-actions.test.js`

**Interfaces:**
- Produces:
  - `listMealPhotos(mealId): Promise<Photo[]>`
  - `uploadMealPhoto(mealId, { mimeType, data }): Promise<Photo>`
  - `deleteMealPhoto(mealId, photoId): Promise<{ deleted: true }>`
  - `remainingPhotoSlots(existingCount, localCount): number`
  - `mimeTypeFromPath(path): 'image/jpeg' | 'image/png' | 'image/webp'`
- `Photo` includes `id`, `url`, `mimeType`, `sizeBytes`, `createdAt`, `createdBy`, `createdById`.
- `url` values are converted from `/media/...` to `${BASE_URL}/media/...`.

- [ ] **Step 1: Write failing helper tests**

Use the same `uni.request` mock harness as `meal-actions.test.js`, with mutable `capturedRequest` and `nextResponse` variables.

```js
test('获取照片列表会补全图片服务器地址', async () => {
  nextResponse = {
    photos: [{
      id: 'photo-1',
      url: '/media/log-photos/a.png',
      mimeType: 'image/png',
      sizeBytes: 20,
      createdAt: '2026-11-10T00:00:00.000Z',
      createdBy: '主厨',
      createdById: 'member-chef',
    }],
  };
  const { listMealPhotos } = await import('../src/utils/photo-actions.js');
  const photos = await listMealPhotos('meal-1');

  assert.equal(capturedRequest.method, 'GET');
  assert.match(capturedRequest.url, /\/api\/meals\/meal-1\/log\/photos$/);
  assert.match(photos[0].url, /^http:\/\/192\.168\.5\.2:8080\/media\/log-photos\/a\.png$/);
});
```

```js
test('剩余照片名额最多为三张且不会为负数', () => {
  const photoActions = await import('../src/utils/photo-actions.js');
  const { remainingPhotoSlots } = photoActions;
  assert.equal(remainingPhotoSlots(0, 0), 3);
  assert.equal(remainingPhotoSlots(2, 1), 0);
  assert.equal(remainingPhotoSlots(4, 0), 0);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/photo-actions.test.js`

Expected: FAIL because `photo-actions.js` does not exist.

- [ ] **Step 3: Implement helper**

```js
import { request } from './index.js';
import { BASE_URL } from './http.js';

const MAX_PHOTOS = 3;

export function remainingPhotoSlots(existingCount, localCount) {
  return Math.max(0, MAX_PHOTOS - Number(existingCount || 0) - Number(localCount || 0));
}

export function mimeTypeFromPath(path) {
  const normalized = String(path || '').toLowerCase();
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function absolutePhoto(photo) {
  return {
    ...photo,
    url: photo.url.startsWith('http') ? photo.url : `${BASE_URL}${photo.url}`,
  };
}

export async function listMealPhotos(mealId) {
  const data = await request(`/meals/${mealId}/log/photos`);
  return (data.photos || []).map(absolutePhoto);
}

export async function uploadMealPhoto(mealId, { mimeType, data }) {
  const photo = await request(`/meals/${mealId}/log/photos`, 'POST', { mimeType, data });
  return absolutePhoto(photo);
}

export function deleteMealPhoto(mealId, photoId) {
  return request(`/meals/${mealId}/log/photos/${photoId}`, 'DELETE');
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/photo-actions.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/src/utils/photo-actions.js miniprogram/tests/photo-actions.test.js
git commit -m "feat: add mini program photo API helpers"
```

---

### Task 6: Add the Log Editor Page

**Files:**
- Create: `miniprogram/src/pages/log-edit/log-edit.vue`
- Modify: `miniprogram/src/pages.json`
- Test: `miniprogram/tests/photo-actions.test.js`

**Interfaces:**
- Consumes:
  - `getMealDetail(mealId)` from `meal-actions.js`.
  - `listMealPhotos`, `uploadMealPhoto`, `deleteMealPhoto`, `remainingPhotoSlots`, `mimeTypeFromPath` from Task 5.
  - Existing `request` and `getMember`.
- Produces: page route `/pages/log-edit/log-edit?mealId=<id>`.

- [ ] **Step 1: Write failing picker-options test**

Append to `photo-actions.test.js`:

```js
test('相册和相机使用正确的选图参数', async () => {
  const { photoPickerOptions } = await import('../src/utils/photo-actions.js');
  assert.deepEqual(photoPickerOptions('album', 2), {
    count: 2,
    sizeType: ['compressed'],
    sourceType: ['album'],
  });
  assert.deepEqual(photoPickerOptions('camera', 1), {
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['camera'],
  });
});
```

Run: `node --test tests/photo-actions.test.js`

Expected: FAIL because `photoPickerOptions` does not exist.

- [ ] **Step 2: Register the page**

Add to `miniprogram/src/pages.json`:

```json
{
  "path": "pages/log-edit/log-edit",
  "style": {
    "navigationBarTitleText": "这顿留句话"
  }
}
```

- [ ] **Step 3: Create the page**

Add this export to `photo-actions.js` before building the page:

```js
export function photoPickerOptions(sourceType, count) {
  return {
    count,
    sizeType: ['compressed'],
    sourceType: [sourceType],
  };
}
```

Data:

```js
data() {
  return {
    mealId: '',
    meal: {},
    sentence: '',
    existingPhotos: [],
    localPhotos: [],
    saving: false,
  };
}
```

`onLoad` stores `mealId`. `onShow` loads meal detail and existing photos:

```js
async load() {
  const [meal, photos] = await Promise.all([
    getMealDetail(this.mealId),
    listMealPhotos(this.mealId),
  ]);
  this.meal = meal;
  this.sentence = meal.log?.sentence || '';
  this.existingPhotos = photos;
}
```

Photo selection:

```js
pickFromAlbum() {
  this.choosePhotos('album');
},
takePhoto() {
  this.choosePhotos('camera');
},
choosePhotos(sourceType) {
  const count = remainingPhotoSlots(this.existingPhotos.length, this.localPhotos.length);
  if (count <= 0) return toast('每顿饭最多 3 张照片');
  uni.chooseImage({
    ...photoPickerOptions(sourceType, count),
    success: (result) => {
      const files = (result.tempFiles || []).map((file) => ({
        path: file.path,
        size: file.size,
        mimeType: mimeTypeFromPath(file.path),
      }));
      this.preparePhotos(files);
    },
  });
}
```

Compression rule:

```js
async preparePhotos(files) {
  for (const file of files) {
    let path = file.path;
    let size = file.size;
    if (size > 2 * 1024 * 1024) {
      path = await compressImage(path);
      size = await getFileSize(path);
    }
    if (size > 2 * 1024 * 1024) {
      toast(`「${path.split('/').pop()}」压缩后仍超过 2 MB`);
      continue;
    }
    this.localPhotos.push({ path, size, mimeType: mimeTypeFromPath(path) });
  }
}
```

Provide `compressImage` and `getFileSize` as Promise wrappers around `uni.compressImage` and `uni.getFileInfo`.

Delete local photo:

```js
removeLocal(index) {
  this.localPhotos.splice(index, 1);
},
```

Delete existing server photo:

```js
async removeExisting(photo) {
  await deleteMealPhoto(this.mealId, photo.id);
  this.existingPhotos = this.existingPhotos.filter((item) => item.id !== photo.id);
},
```

Save:

```js
async save() {
  this.saving = true;
  try {
    await request(`/meals/${this.mealId}/log`, 'POST', {
      sentence: this.sentence || '',
      rating: '',
    });
    while (this.localPhotos.length) {
      const file = this.localPhotos[0];
      const data = await readFileBase64(file.path);
      const saved = await uploadMealPhoto(this.mealId, {
        mimeType: file.mimeType,
        data,
      });
      this.existingPhotos.push(saved);
      this.localPhotos.shift();
    }
    toast('留话已保存');
    setTimeout(() => uni.navigateBack(), 400);
  } catch (error) {
    toast(error.message);
  } finally {
    this.saving = false;
  }
}
```

Render requirements:

- Multi-line `<textarea v-model="sentence">`.
- Existing photos and local photos in a grid.
- Local photos have a delete `×`.
- Two buttons: “从相册选择” and “拍照”.
- Saving button is disabled while `saving`.
- Tapping a photo calls `uni.previewImage`.

- [ ] **Step 4: Build the mini program**

Run: `npm run build:mp-weixin`

Expected: build succeeds and `dist/build/mp-weixin/pages/log-edit/log-edit` exists.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/src/pages.json miniprogram/src/pages/log-edit/log-edit.vue miniprogram/tests/photo-actions.test.js
git commit -m "feat: add meal log photo editor"
```

---

### Task 7: Integrate Photos into the Log List and Detail Sheet

**Files:**
- Modify: `miniprogram/src/pages/log/log.vue`
- Test: `miniprogram/tests/photo-actions.test.js`

**Interfaces:**
- Consumes:
  - `listMealPhotos(mealId)` from Task 5.
  - `getMealDetail(mealId)` from `meal-actions.js`.
  - `photo_count` in calendar rows from Task 1.
- Produces:
  - “留话” navigates to the editor page.
  - Log cards show photo count.
  - Detail sheet shows thumbnails and full-screen preview.

- [ ] **Step 1: Add failing contract assertion**

Append to `photo-actions.test.js`:

```js
test('照片列表请求使用饭局照片接口', async () => {
  nextResponse = { photos: [] };
  const { listMealPhotos } = await import('../src/utils/photo-actions.js');
  await listMealPhotos('meal-log');
  assert.equal(capturedRequest.method, 'GET');
  assert.match(capturedRequest.url, /\/api\/meals\/meal-log\/log\/photos$/);
});
```

Run: `node --test tests/photo-actions.test.js`

Expected: PASS after Task 5; this protects the integration contract.

- [ ] **Step 2: Update the “留话” action**

Replace the existing modal in `leaveLog` with navigation:

```js
leaveLog(meal) {
  uni.navigateTo({
    url: `/pages/log-edit/log-edit?mealId=${meal.id}`,
  });
},
```

- [ ] **Step 3: Show photo counts**

In the log card metadata:

```vue
<view class="muted">
  {{ m.meal_date }}
  <text v-if="m.photo_count"> · 有照片 {{ m.photo_count }} 张</text>
  <text v-if="m.sentence"> · “{{ m.sentence }}”</text>
</view>
```

- [ ] **Step 4: Load photos for the detail sheet**

Add `detailPhotos: []` to data.

Change `openDetail`:

```js
async openDetail(meal) {
  try {
    const [detail, photos] = await Promise.all([
      getMealDetail(meal.id),
      listMealPhotos(meal.id),
    ]);
    this.detailMeal = detail;
    this.detailDishes = detail.items || [];
    this.detailPhotos = photos;
    this.detailVisible = true;
  } catch (error) {
    toast(error.message);
  }
},
```

Render a photo grid inside the existing detail panel:

```vue
<view v-if="detailPhotos.length" class="section-title" style="margin:20rpx 0 8rpx;">照片</view>
<view v-if="detailPhotos.length" class="photo-grid">
  <image
    v-for="(photo, index) in detailPhotos"
    :key="photo.id"
    :src="photo.url"
    mode="aspectFill"
    class="photo-thumb"
    @tap="previewDetailPhoto(index)"
  />
</view>
```

Preview method:

```js
previewDetailPhoto(index) {
  uni.previewImage({
    urls: this.detailPhotos.map((photo) => photo.url),
    current: this.detailPhotos[index].url,
  });
},
```

Photo grid styles:

```css
.photo-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:10rpx; margin-bottom:20rpx; }
.photo-thumb { width:100%; height:180rpx; border-radius:14rpx; background:#EFE7DC; }
```

- [ ] **Step 5: Run all tests and build**

Run: `npm test`

Expected: all mini-program tests pass.

Run: `npm run build:mp-weixin`

Expected: build succeeds.

Run in WeChat DevTools:

- open a closed meal detail;
- verify existing meals without photos still work;
- open “留话” and select a photo from album;
- take a photo on a real device;
- save and verify the photo count appears;
- open detail and preview the image;
- delete a photo and confirm the server file is removed.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/src/pages/log/log.vue miniprogram/tests/photo-actions.test.js
git commit -m "feat: show meal log photos in history"
```

---

## Final Verification

- [ ] Run backend tests: `cd backend && npm test`
- [ ] Run mini-program tests: `cd miniprogram && npm test`
- [ ] Build: `cd miniprogram && npm run build:mp-weixin`
- [ ] Check health: `curl http://192.168.5.2:8080/health`
- [ ] Verify upload body limit, MIME rejection and 3-photo limit against a temporary meal.
- [ ] Verify deleting the temporary meal removes its `uploads/log-photos` files.
- [ ] Verify `data/backups/uploads-*` contains photo files.
- [ ] Restart the local backend and confirm the dev watcher rebuilds `dist/dev/mp-weixin`.

