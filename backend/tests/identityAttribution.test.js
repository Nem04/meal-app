import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_DIR = ':memory:';
const svc = await import('../src/services.js');
const repo = await import('../src/repo.js');
const dbm = await import('../src/db.js');

before(() => { dbm.openDb(); });
afterEach(() => { dbm.closeDbForTest(); });

function recipeVersion() {
  return svc.createRecipeFromSpecs({
    name: '番茄炒蛋',
    category: '素',
    steps: '',
    specs: [
      { raw_name: '番茄', quantity: 2, unit: '个' },
      { raw_name: '鸡蛋', quantity: 3, unit: '个' },
    ],
  }).version_id;
}

test('两位成员点同一道菜时保留两条提交审计记录', () => {
  const versionId = recipeVersion();
  const meal = svc.openMeal({
    title: '今晚',
    meal_date: '2026-11-04',
    created_by: '爸爸',
  });
  const chef = { id: 'member-chef', name: '爸爸' };
  const family = { id: 'member-family', name: '妈妈' };

  svc.addMealItem({
    meal_id: meal.id,
    recipe_version_id: versionId,
    member: chef,
    note: '少辣',
  });
  svc.addMealItem({
    meal_id: meal.id,
    recipe_version_id: versionId,
    member: family,
    note: '多放葱',
  });

  assert.equal(repo.listMealItems(meal.id).length, 1);
  const submissions = repo.listMealSubmissions(meal.id);
  assert.equal(submissions.length, 2);
  assert.deepEqual(
    submissions.map((item) => item.member_name_snapshot).sort(),
    ['妈妈', '爸爸'],
  );
});
