import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// 用内存库跑服务层测试：必须在 import 前设置。
process.env.DATA_DIR = ':memory:';

const svc = await import('../src/services.js');
const dbm = await import('../src/db.js');

before(() => { dbm.openDb(); });
afterEach(() => { dbm.closeDbForTest(); });

function makeDataDir(t) {
  const dataDir = mkdtempSync(join(tmpdir(), 'meal-photo-'));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  return dataDir;
}

test('每顿饭最多保存三张照片', (t) => {
  const dataDir = makeDataDir(t);
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

test('照片只能由上传者本人或主厨删除', (t) => {
  const dataDir = makeDataDir(t);
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

test('删除饭局时同时删除照片文件', (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'meal-photo-cleanup-'));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
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
