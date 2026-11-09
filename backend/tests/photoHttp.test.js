import { createServer } from 'node:http';
import { once } from 'node:events';
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// 用临时目录跑 HTTP 测试：数据库和照片文件都落在真实目录里。
const dataDir = mkdtempSync(join(tmpdir(), 'meal-http-'));
process.env.DATA_DIR = dataDir;
process.env.AUTH_MODE = 'legacy';

const { handle } = await import('../src/routes.js');
const { serveLogPhotoFile } = await import('../src/http.js');
const { config } = await import('../src/config.js');
const dbm = await import('../src/db.js');
const repo = await import('../src/repo.js');

const CHEF = 'member-chef';
const FAMILY = 'member-family';

const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const PNG_BASE64 = PNG_BYTES.toString('base64');

let server;
let baseUrl;

before(async () => {
  dbm.openDb();
  server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/media/log-photos/')) {
      serveLogPhotoFile(url.pathname, res, config.dataDir);
      return;
    }
    handle(req, res, url);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => {
  repo.db()
    .prepare("UPDATE meal SET status = 'closed', closed_at = ? WHERE status = 'open'")
    .run(new Date().toISOString());
});

after(async () => {
  server.close();
  await once(server, 'close');
  dbm.closeDbForTest();
  rmSync(dataDir, { recursive: true, force: true });
});

async function createMeal(title = '照片饭') {
  const response = await fetch(`${baseUrl}/meals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-member-id': CHEF },
    body: JSON.stringify({ title, meal_date: '2026-11-10' }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).data;
}

test('已认证成员可以列出饭局照片，初始为空', async () => {
  const meal = await createMeal('照片列表');

  const anon = await fetch(`${baseUrl}/meals/${meal.id}/log/photos`);
  assert.equal(anon.status, 401);

  const response = await fetch(`${baseUrl}/meals/${meal.id}/log/photos`, {
    headers: { 'x-member-id': FAMILY },
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { photos: [] });
});

test('合法 PNG 上传返回 201 和照片文件地址', async () => {
  const meal = await createMeal('上传照片');

  const response = await fetch(`${baseUrl}/meals/${meal.id}/log/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-member-id': FAMILY },
    body: JSON.stringify({ data: PNG_BASE64, mimeType: 'image/png' }),
  });
  assert.equal(response.status, 201);
  const photo = (await response.json()).data;
  assert.match(photo.url, /^\/media\/log-photos\/[a-f0-9]{48}\.png$/);
  assert.equal(photo.mimeType, 'image/png');
  assert.ok(photo.id);
});

test('上传者本人可以删除照片', async () => {
  const meal = await createMeal('删除照片');

  const upload = await fetch(`${baseUrl}/meals/${meal.id}/log/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-member-id': FAMILY },
    body: JSON.stringify({ data: PNG_BASE64, mimeType: 'image/png' }),
  });
  const photo = (await upload.json()).data;

  const deletion = await fetch(`${baseUrl}/meals/${meal.id}/log/photos/${photo.id}`, {
    method: 'DELETE',
    headers: { 'x-member-id': FAMILY },
  });
  assert.equal(deletion.status, 200);
  assert.equal((await deletion.json()).data.deleted, true);

  const list = await fetch(`${baseUrl}/meals/${meal.id}/log/photos`, {
    headers: { 'x-member-id': FAMILY },
  });
  assert.deepEqual((await list.json()).data, { photos: [] });
});

test('图片内容与声明的 MIME 不匹配时返回 PHOTO_INVALID_CONTENT', async () => {
  const meal = await createMeal('无效照片');

  const response = await fetch(`${baseUrl}/meals/${meal.id}/log/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-member-id': FAMILY },
    body: JSON.stringify({
      data: Buffer.from('not an image').toString('base64'),
      mimeType: 'image/png',
    }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).data.code, 'PHOTO_INVALID_CONTENT');
});

test('请求体超过 3 MB 时返回 PAYLOAD_TOO_LARGE', async () => {
  const meal = await createMeal('超大照片');
  const oversized = JSON.stringify({
    data: 'a'.repeat(3 * 1024 * 1024 + 1024),
    mimeType: 'image/png',
  });

  const response = await fetch(`${baseUrl}/meals/${meal.id}/log/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-member-id': FAMILY },
    body: oversized,
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).data.code, 'PAYLOAD_TOO_LARGE');
});

test('媒体文件接口返回已保存的图片字节', async () => {
  const meal = await createMeal('读取照片');

  const upload = await fetch(`${baseUrl}/meals/${meal.id}/log/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-member-id': FAMILY },
    body: JSON.stringify({ data: PNG_BASE64, mimeType: 'image/png' }),
  });
  const photo = (await upload.json()).data;
  const fileName = photo.url.slice('/media/log-photos/'.length);

  const response = await fetch(`${baseUrl}/media/log-photos/${fileName}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'private, max-age=3600');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG_BYTES);
});

async function uploadPng(mealId, memberId = FAMILY) {
  const response = await fetch(`${baseUrl}/meals/${mealId}/log/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-member-id': memberId },
    body: JSON.stringify({ data: PNG_BASE64, mimeType: 'image/png' }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).data;
}

test('声明 GIF 类型时返回 PHOTO_TYPE_UNSUPPORTED', async () => {
  const meal = await createMeal('不支持的类型');

  const response = await fetch(`${baseUrl}/meals/${meal.id}/log/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-member-id': FAMILY },
    body: JSON.stringify({
      data: 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
      mimeType: 'image/gif',
    }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).data.code, 'PHOTO_TYPE_UNSUPPORTED');
});

test('第四张照片返回 409 PHOTO_LIMIT_EXCEEDED', async () => {
  const meal = await createMeal('照片上限');

  for (let index = 0; index < 3; index += 1) {
    await uploadPng(meal.id);
  }

  const response = await fetch(`${baseUrl}/meals/${meal.id}/log/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-member-id': FAMILY },
    body: JSON.stringify({ data: PNG_BASE64, mimeType: 'image/png' }),
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).data.code, 'PHOTO_LIMIT_EXCEEDED');
});

test('主厨可以删除其他成员上传的照片', async () => {
  const meal = await createMeal('主厨删除');
  const photo = await uploadPng(meal.id, FAMILY);

  const deletion = await fetch(`${baseUrl}/meals/${meal.id}/log/photos/${photo.id}`, {
    method: 'DELETE',
    headers: { 'x-member-id': CHEF },
  });
  assert.equal(deletion.status, 200);
  assert.equal((await deletion.json()).data.deleted, true);

  const list = await fetch(`${baseUrl}/meals/${meal.id}/log/photos`, {
    headers: { 'x-member-id': CHEF },
  });
  assert.deepEqual((await list.json()).data, { photos: [] });
});

test('未知照片子路径 POST 返回 404 且不写日志', async () => {
  const meal = await createMeal('错误子路径');

  const response = await fetch(`${baseUrl}/meals/${meal.id}/log/photos/extra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-member-id': CHEF },
    body: JSON.stringify({ sentence: '不应写入', rating: '好吃' }),
  });
  assert.equal(response.status, 404);
  assert.equal(repo.getMealLog(meal.id), undefined);
});

test('未知照片子路径 GET 返回 404', async () => {
  const meal = await createMeal('错误子路径读取');

  const response = await fetch(`${baseUrl}/meals/${meal.id}/log/photos/extra`, {
    headers: { 'x-member-id': CHEF },
  });
  assert.equal(response.status, 404);
});

test('DELETE /meals/:id/log/photos 不带照片 ID 时返回 404 且不删除饭局', async () => {
  const meal = await createMeal('照片删除守卫');

  const response = await fetch(`${baseUrl}/meals/${meal.id}/log/photos`, {
    method: 'DELETE',
    headers: { 'x-member-id': CHEF },
  });
  assert.equal(response.status, 404);

  const stillThere = await fetch(`${baseUrl}/meals/${meal.id}`, {
    headers: { 'x-member-id': CHEF },
  });
  assert.equal(stillThere.status, 200);
  assert.equal((await stillThere.json()).data.id, meal.id);
});
