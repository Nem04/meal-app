// 用例服务层：业务逻辑 + 红线守卫。路由层只转参数。
import * as repo from './repo.js';
import { mergeIngredients } from './domain/merge.js';
import { parseInventoryText } from './domain/parseInventory.js';
import { canonicalName, normalizeUnit } from './domain/canonical.js';

// ---------- 菜品 / 菜谱 ----------
export function listRecipes(category) {
  return repo.listRecipes(category || '');
}

export function getRecipeDetail(recipeId) {
  const recipe = repo.getRecipe(recipeId);
  if (!recipe) return null;
  const versions = dbAll('SELECT * FROM recipe_version WHERE recipe_id = ? ORDER BY created_at DESC', recipeId);
  const current = versions.find((v) => v.id === recipe.current_version_id) || versions[0];
  const specs = current ? repo.listVersionSpecs(current.id) : [];
  return { ...recipe, versions, current_version: current, specs };
}

export function createRecipeFromSpecs({ name, category = '其他', steps = '', specs = [] }) {
  const { recipe_id, version_id } = repo.createRecipe(name, category || '其他', '原创');
  applySpecsToVersion(version_id, steps, specs);
  return { recipe_id, version_id };
}

export function deleteRecipe(recipeId) {
  const recipe = repo.getRecipe(recipeId);
  if (!recipe) throw new Error('这份菜谱不存在');
  // 保护历史：如果这道菜谱已经被某顿饭用过，不允许删除（会破坏历史饭局）。
  const refs = repo.countRecipeMealReferences(recipeId);
  if (refs > 0) {
    throw new Error(`这份菜谱已被 ${refs} 顿饭用过，不能删除（会破坏历史记录）`);
  }
  const changes = repo.deleteRecipe(recipeId);
  return { deleted: changes > 0, recipe_id: recipeId };
}
export function forkRecipeVersion(versionId) {
  const src = repo.getVersion(versionId);
  if (!src) throw new Error('菜谱版本不存在');
  const srcSpecs = repo.listVersionSpecs(versionId);
  const newVid = repo.insertVersion(`${src.title} · 我家版`, src.recipe_id, src.steps, versionId, false);
  for (const s of srcSpecs) {
    repo.insertSpec(newVid, s.raw_name, s.canonical_name, s.quantity, s.unit, s.note);
  }
  repo.setRecipeCurrentVersion(src.recipe_id, newVid);
  return { recipe_id: src.recipe_id, version_id: newVid };
}

export function overwriteVersion({ versionId, title = '', steps = '', specs = [] }) {
  const v = repo.getVersion(versionId);
  if (!v) throw new Error('版本不存在');
  // copy-on-write：编辑只改该版本，绝不触碰 fork 源。
  repo.setVersionSteps(versionId, steps);
  if (title) repo.updateVersionTitle(versionId, title);
  repo.deleteSpecs(versionId);
  for (const s of specs) {
    const raw = s.raw_name || s.name || '';
    if (!raw) continue;
    repo.insertSpec(versionId, raw, canonicalName(raw), Number(s.quantity) || 0, normalizeUnit(s.unit || ''), s.note || '');
  }
  repo.setRecipeCurrentVersion(v.recipe_id, versionId);
  return { version_id: versionId };
}

function applySpecsToVersion(versionId, steps, specs) {
  repo.setVersionSteps(versionId, steps || '');
  for (const s of specs || []) {
    const raw = s.raw_name || s.name || '';
    if (!raw) continue;
    repo.insertSpec(versionId, raw, canonicalName(raw), Number(s.quantity) || 0, normalizeUnit(s.unit || ''), s.note || '');
  }
}

// ---------- 开饭 / 点菜 ----------
export function listMeals() {
  return repo.listMeals();
}

export function openMeal({ title, meal_date, created_by }) {
  if (!title) title = '今晚这顿饭';
  if (!meal_date) meal_date = new Date().toISOString().slice(0, 10);
  const id = repo.insertMeal(title, meal_date, created_by);
  return getMealDetail(id);
}

export function getMealWithPrep(mealId) {
  const meal = getMealDetail(mealId);
  if (!meal) return null;
  const prep = listPrep(mealId);
  const log = repo.getMealLog(mealId);
  return { ...meal, prep, log: log || null };
}

function getMealDetail(id) {
  const meal = repo.getMeal(id);
  if (!meal) return null;
  return { ...meal, items: repo.listMealItems(id) };
}

export function addMealItem({ meal_id, recipe_version_id, submitter = '家人', quantity = 1, note = '' }) {
  const meal = repo.getMeal(meal_id);
  if (!meal) throw new Error('这顿饭不存在');
  if (meal.status !== 'open') throw new Error('这顿饭已经结束了');
  if (!repo.getVersion(recipe_version_id)) throw new Error('菜谱版本不存在');
  // 去重：同一顿饭里同一道菜只保留一行，重复点只更新备注。
  repo.upsertMealItem(meal_id, recipe_version_id, submitter, Number(quantity) || 1, note);
  const result = regeneratePrep(meal_id);
  return { meal: getMealDetail(meal_id), prep: result };
}

export function regeneratePrep(mealId) {
  const specs = repo.specsForMeal(mealId);
  const merged = mergeIngredients(specs);

  const invMap = new Map();
  for (const it of repo.listInventory()) invMap.set(`${it.canonical_name}|${it.unit}`, Number(it.quantity));

  repo.clearPrep(mealId);
  const entries = [];
  for (const m of merged) {
    const available = invMap.get(`${m.canonical_name}|${m.unit}`);
    const availNum = available === undefined ? 0 : available;
    const entry = {
      canonical_name: m.canonical_name,
      unit: m.unit,
      total_quantity: m.total_quantity,
      available: available === undefined ? null : availNum,
      shortage: Math.round(Math.max(0, m.total_quantity - availNum) * 100) / 100,
      cross_unit_note: m.cross_unit_note || null,
    };
    repo.insertPrep(mealId, entry);
    entries.push(entry);
  }
  return listPrep(mealId);
}

export function listPrep(mealId) {
  const rows = repo.listPrep(mealId);
  const total = rows.length;
  const prepared = rows.filter((r) => r.prepared === 1).length;
  return { total, prepared, missing: rows.filter((r) => r.shortage > 0).length, entries: rows };
}

export function togglePrep({ meal_id, entry_id, prepared }) {
  // 红线：只允许修改 meal_prep_entry.prepared，不触碰 inventory_item。
  const result = repo.setPrepPrepared(entry_id, meal_id, !!prepared);
  if (result.changes === 0) throw new Error('备菜条目不存在');
  return listPrep(meal_id);
}

export function deleteMeal(mealId) {
  const meal = repo.getMeal(mealId);
  if (!meal) throw new Error('这顿饭不存在');
  // 日志等关联记录由外键级联删除（meal_log ON DELETE CASCADE）。
  const changes = repo.deleteMeal(mealId);
  return { deleted: changes > 0, meal_id: mealId };
}

export function closeMeal(mealId) {
  const meal = repo.getMeal(mealId);
  if (!meal) throw new Error('这顿饭不存在');
  repo.updateMealStatus(mealId, 'closed');
  return repo.getMeal(mealId);
}

// ---------- 库存 ----------
export function listInventory(search) {
  return repo.listInventory(search || '');
}

export function parseInventory(text) {
  const { items, failed } = parseInventoryText(text);
  return { items, failed };
}

export function bulkAddInventory(text, operator = '') {
  const { items, failed } = parseInventoryText(text);
  const saved = [];
  for (const it of items) {
    const itemId = repo.upsertInventoryItem(it.name, it.quantity, it.unit, operator, '');
    const r = repo.applyInventoryOp(itemId, 'add', it.quantity, '整段录入', operator);
    saved.push({ name: it.name, quantity: r.quantity, unit: it.unit });
  }
  return { saved, failed };
}

export function inventoryAdd({ name, quantity, unit, note, operator }) {
  const itemId = repo.upsertInventoryItem(canonicalName(name), Number(quantity) || 0, normalizeUnit(unit || ''), operator, note);
  return repo.applyInventoryOp(itemId, 'add', Number(quantity) || 0, note, operator);
}

export function inventorySubtract({ id, quantity, note, operator }) {
  return repo.applyInventoryOp(id, 'subtract', Number(quantity) || 0, note, operator);
}

export function inventoryStocktake({ id, quantity, note, operator }) {
  return repo.applyInventoryOp(id, 'stocktake', Number(quantity) || 0, note, operator);
}

// ---------- 日志 / 月历 ----------
export function saveMealLog({ meal_id, sentence, rating }) {
  const meal = repo.getMeal(meal_id);
  if (!meal) throw new Error('这顿饭不存在');
  repo.upsertMealLog(meal_id, sentence, rating);
  return repo.getMealLog(meal_id);
}

export function calendarMonth(year, month) {
  return repo.mealsForMonth(year, month);
}

function dbAll(sql, ...args) {
  return repo.db().prepare(sql).all(...args);
}

