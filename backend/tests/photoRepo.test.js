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
  repo.updateMealStatus(mealId, 'closed');
  assert.equal(repo.mealsForMonth(2026, 11)[0].photo_count, 1);
  assert.equal(repo.deleteMealLogPhoto(mealId, 'photo-1'), 1);
  assert.equal(repo.countMealLogPhotos(mealId), 0);
});
