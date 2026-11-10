import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// 用内存库跑服务层测试：必须在 import 前设置。
process.env.DATA_DIR = ':memory:';

const svc = await import('../src/services.js');
const repo = await import('../src/repo.js');
const dbm = await import('../src/db.js');

before(() => { dbm.openDb(); });
afterEach(() => { dbm.closeDbForTest(); });

function seedRecipeWith(name, specs) {
  return svc.createRecipeFromSpecs({ name, category: '素', steps: '步骤', specs });
}

test('红线T1：勾选备齐前后，库存快照一致', () => {
  const { recipe_id, version_id } = seedRecipeWith('葱爆鸡蛋', [
    { raw_name: '葱', quantity: 2, unit: '根' },
    { raw_name: '鸡蛋', quantity: 3, unit: '个' },
  ]);

  // 库存先有葱 1 根、鸡蛋 5 个。
  svc.bulkAddInventory('葱1根、鸡蛋5个', '测试');
  const invBefore = JSON.stringify(repo.listInventory());

  const meal = svc.openMeal({ title: '今晚', meal_date: '2026-11-03', created_by: '主厨' });
  svc.addMealItem({ meal_id: meal.id, recipe_version_id: version_id, submitter: '家人' });
  let prep = svc.regeneratePrep(meal.id);
  const missingEntry = prep.entries.find((e) => e.canonical_name === '葱');
  assert.ok(missingEntry);

  // 勾选备齐：只改 prep，不碰库存。
  svc.togglePrep({ meal_id: meal.id, entry_id: missingEntry.id, prepared: true });
  const invAfter = JSON.stringify(repo.listInventory());
  assert.equal(invBefore, invAfter, '勾选备齐不应改变库存');

  const prep2 = svc.listPrep(meal.id);
  assert.equal(prep2.entries.find((e) => e.id === missingEntry.id).prepared, 1);
});

test('未指定日期开饭时使用本地日期而不是 UTC 日期', () => {
  const localMidnight = new Date(2099, 0, 1, 0, 1, 0);
  const meal = svc.openMeal({
    title: '午夜加餐',
    created_by: '主厨',
  }, localMidnight);

  assert.equal(meal.meal_date, '2099-01-01');
});

test('同一时间只允许一顿进行中的饭', () => {
  const first = svc.openMeal({ title: '第一顿', meal_date: '2026-11-10', created_by: '主厨' });

  assert.throws(
    () => svc.openMeal({ title: '第二顿', meal_date: '2026-11-10', created_by: '主厨' }),
    (error) => error.code === 'OPEN_MEAL_EXISTS',
  );

  svc.closeMeal(first.id);
  const second = svc.openMeal({ title: '第二顿', meal_date: '2026-11-10', created_by: '主厨' });
  assert.equal(second.status, 'open');
});

test('月历只列出已经结束的饭', () => {
  const meal = svc.openMeal({ title: '进行中', meal_date: '2026-11-10', created_by: '主厨' });

  assert.deepEqual(svc.calendarMonth(2026, 11), []);

  svc.closeMeal(meal.id);
  const days = svc.calendarMonth(2026, 11);
  assert.equal(days.length, 1);
  assert.equal(days[0].id, meal.id);
});

test('备菜清单同时返回已点的菜名和合并后的食材', () => {
  const egg = seedRecipeWith('番茄炒蛋', [
    { raw_name: '番茄', quantity: 2, unit: '个' },
    { raw_name: '鸡蛋', quantity: 3, unit: '个' },
  ]);
  const broccoli = seedRecipeWith('炒西兰花', [
    { raw_name: '西兰花', quantity: 1, unit: '颗' },
  ]);
  const meal = svc.openMeal({ title: '今晚', meal_date: '2026-11-09', created_by: '主厨' });
  svc.addMealItem({ meal_id: meal.id, recipe_version_id: egg.version_id, submitter: '主厨' });
  svc.addMealItem({ meal_id: meal.id, recipe_version_id: broccoli.version_id, submitter: '家人' });

  const prep = svc.listPrep(meal.id);

  assert.deepEqual(
    prep.dishes.map((dish) => dish.recipe_name).sort(),
    ['番茄炒蛋', '炒西兰花'].sort(),
  );
  assert.deepEqual(
    prep.entries.map((entry) => entry.canonical_name).sort(),
    ['番茄', '鸡蛋', '西兰花'].sort(),
  );
});

test('删除已点菜后同步清理提交记录和备菜食材', () => {
  const { version_id } = seedRecipeWith('番茄炒蛋', [
    { raw_name: '番茄', quantity: 2, unit: '个' },
    { raw_name: '鸡蛋', quantity: 3, unit: '个' },
  ]);
  const meal = svc.openMeal({ title: '今晚', meal_date: '2026-11-09', created_by: '主厨' });
  const member = { id: 'member-chef', name: '主厨' };
  const added = svc.addMealItem({
    meal_id: meal.id,
    recipe_version_id: version_id,
    member,
  });
  const itemId = added.meal.items[0].id;
  assert.equal(added.prep.dishes.length, 1);
  assert.equal(added.prep.entries.length, 2);

  const result = svc.deleteMealItem({ meal_id: meal.id, item_id: itemId });

  assert.equal(result.deleted, true);
  assert.equal(result.prep.dishes.length, 0);
  assert.equal(result.prep.entries.length, 0);
  assert.deepEqual(repo.listMealItems(meal.id), []);
  assert.deepEqual(repo.listMealSubmissions(meal.id), []);
});

test('红线T2：fork 我家版后改副本，原版不变', () => {
  const { recipe_id, version_id } = seedRecipeWith('糖醋排骨', [
    { raw_name: '排骨', quantity: 1, unit: '斤' },
  ]);
  const fork = svc.forkRecipeVersion(version_id);

  // 改我家版：换成 2 斤。
  svc.overwriteVersion({ versionId: fork.version_id, title: '我家版', steps: '', specs: [{ raw_name: '排骨', quantity: 2, unit: '斤' }] });

  const baseSpecs = repo.listVersionSpecs(version_id);
  const forkSpecs = repo.listVersionSpecs(fork.version_id);
  assert.equal(baseSpecs[0].quantity, 1, '原版不应变');
  assert.equal(forkSpecs[0].quantity, 2, '副本应改');
});

test('基础菜谱不能直接覆盖，必须先另存为我家版', () => {
  const { version_id } = seedRecipeWith('蒜蓉青菜', [
    { raw_name: '青菜', quantity: 1, unit: '斤' },
  ]);

  assert.throws(
    () => svc.overwriteVersion({
      versionId: version_id,
      specs: [{ raw_name: '青菜', quantity: 3, unit: '斤' }],
    }),
    (error) => error.code === 'BASE_VERSION_READONLY',
  );
  assert.equal(repo.listVersionSpecs(version_id)[0].quantity, 1);

  const fork = svc.forkRecipeVersion(version_id);
  svc.overwriteVersion({
    versionId: fork.version_id,
    specs: [{ raw_name: '青菜', quantity: 2, unit: '斤' }],
  });
  assert.equal(repo.listVersionSpecs(fork.version_id)[0].quantity, 2);
});

test('红线T3：同饭同菜重复点菜不新增行', () => {
  const { version_id } = seedRecipeWith('清蒸鱼', [
    { raw_name: '鲈鱼', quantity: 1, unit: '条' },
  ]);
  const meal = svc.openMeal({ title: '今晚', meal_date: '2026-11-03' });
  svc.addMealItem({ meal_id: meal.id, recipe_version_id: version_id, submitter: '家人', note: '不要辣' });
  svc.addMealItem({ meal_id: meal.id, recipe_version_id: version_id, submitter: '主厨', note: '加辣' });
  const items = repo.listMealItems(meal.id);
  assert.equal(items.length, 1, '同一道菜应只有一条');
  assert.equal(items[0].note, '加辣');
});

test('饭局点菜明细包含稳定的菜谱 ID', () => {
  const { recipe_id, version_id } = seedRecipeWith('清炒时蔬', [
    { raw_name: '青菜', quantity: 1, unit: '斤' },
  ]);
  const meal = svc.openMeal({ title: '今晚', meal_date: '2026-11-10' });
  svc.addMealItem({ meal_id: meal.id, recipe_version_id: version_id, submitter: '家人' });

  assert.equal(repo.listMealItems(meal.id)[0].recipe_id, recipe_id);
});

test('删除未使用过的菜谱', () => {
  const { recipe_id } = seedRecipeWith('凉拌黄瓜', [{ raw_name: '黄瓜', quantity: 1, unit: '根' }]);
  assert.ok(repo.getRecipe(recipe_id), '删除前应存在');
  const r = svc.deleteRecipe(recipe_id);
  assert.equal(r.deleted, true);
  assert.equal(repo.getRecipe(recipe_id), undefined, '菜谱应被删除');
});

test('被饭局用过的菜谱拒绝删除', () => {
  const { version_id, recipe_id } = seedRecipeWith('清蒸鲈鱼', [{ raw_name: '鲈鱼', quantity: 1, unit: '条' }]);
  const meal = svc.openMeal({ title: '今晚', meal_date: '2026-11-04' });
  svc.addMealItem({ meal_id: meal.id, recipe_version_id: version_id, submitter: '家人' });
  assert.throws(() => svc.deleteRecipe(recipe_id), /已被.*顿饭用过/);
  assert.ok(repo.getRecipe(recipe_id), '被使用的菜谱不应被删除');
});

test('删除饭局后，日志记录也级联删除', () => {
  const meal = svc.openMeal({ title: '今晚', meal_date: '2026-11-03' });
  const mealId = meal.id;

  // 写一条日志。
  svc.saveMealLog({ meal_id: mealId, sentence: '红烧肉绝了', rating: '好吃' });
  assert.ok(repo.getMealLog(mealId), '删除前应有日志');

  // 删除饭局。
  const r = svc.deleteMeal(mealId);
  assert.equal(r.deleted, true, '应返回已删除');

  assert.equal(repo.getMeal(mealId), undefined, '饭局应不存在');
  assert.equal(repo.getMealLog(mealId), undefined, '日志应被级联删除');
  assert.deepEqual(repo.listMealItems(mealId), [], '点菜明细应被级联删除');
  assert.deepEqual(repo.listPrep(mealId), [], '备菜条目应被级联删除');
});

test('库存批次录入生成 3 条', () => {
  const r = svc.bulkAddInventory('芹菜一斤，酱油一瓶、鸡蛋十个', '主厨');
  assert.equal(r.saved.length, 3);
  assert.equal(r.failed.length, 0);
});

test('新库存首次录入不会重复翻倍', () => {
  svc.bulkAddInventory('芹菜一斤，鸡蛋十个', '主厨');
  const bulkInventory = svc.listInventory();
  assert.equal(bulkInventory.find((item) => item.canonical_name === '芹菜').quantity, 1);
  assert.equal(bulkInventory.find((item) => item.canonical_name === '鸡蛋').quantity, 10);

  svc.inventoryAdd({ name: '酱油', quantity: 1, unit: '瓶', operator: '主厨' });
  const single = svc.listInventory().find((item) => item.canonical_name === '酱油');
  assert.equal(single.quantity, 1);
});



test('成员身份：点餐记录是谁点的', () => {
  const { version_id } = seedRecipeWith('蒜蓉炒蛋', [{ raw_name: '鸡蛋', quantity: 2, unit: '个' }]);
  const member = svc.identifyMember('妈妈');
  const meal = svc.openMeal({ title: '今晚', meal_date: '2026-11-04', created_by: '主厨' });
  svc.addMealItem({ meal_id: meal.id, recipe_version_id: version_id, submitter: member.name });
  const items = repo.listMealItems(meal.id);
  assert.equal(items.length, 1);
  assert.equal(items[0].submitter, '妈妈', '点餐人应被记录');
});

test('主厨权限：普通家人调用 guardChef 应被拒绝', () => {
  const member = svc.identifyMember('表弟');
  assert.equal(member.role, 'member');
  assert.throws(() => svc.guardChef(member.id), /只有主厨/);
});

test('主厨权限：默认主厨可通过 guardChef', () => {
  const chef = svc.identifyMember('主厨');
  assert.equal(chef.role, 'chef');
  assert.doesNotThrow(() => svc.guardChef(chef.id));
});

test('删除库存条目', () => {
  svc.bulkAddInventory('芹菜一斤、酱油一瓶', '主厨');
  let inv = svc.listInventory();
  const target = inv.find((i) => i.canonical_name === '芹菜');
  assert.ok(target, '库存中应有芹菜');
  const r = svc.deleteInventory(target.id);
  assert.equal(r.deleted, true);
  inv = svc.listInventory();
  assert.equal(inv.find((i) => i.id === target.id), undefined, '库存应被删除');
});
