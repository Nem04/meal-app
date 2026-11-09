// 用例服务层：业务逻辑 + 红线守卫。路由层只转参数。
import * as repo from './repo.js';
import { mergeIngredients } from './domain/merge.js';
import { parseInventoryText } from './domain/parseInventory.js';
import { canonicalName, normalizeUnit } from './domain/canonical.js';
import { AppError } from './errors.js';
import { verifyBindCode } from './auth/passcode.js';
import { hashSessionToken, newSessionToken, sessionExpiresAt } from './auth/session.js';
import { createAttemptLimiter } from './auth/rateLimit.js';
import { uuid } from './util.js';
import {
  MAX_LOG_PHOTOS_PER_MEAL,
  saveLogPhotoFile,
  deleteLogPhotoFile,
} from './media/logPhotoStore.js';

export function healthCheck() {
  repo.db().prepare('SELECT 1').get();
}

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
  return {
    ...meal,
    items: repo.listMealItems(id),
    submissions: repo.listMealSubmissions(id),
  };
}

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
  deleteLogPhotoFile({ dataDir, fileName: photo.file_name });
  repo.deleteMealLogPhoto(meal_id, photo_id);
  return { deleted: true, photo_id };
}

export function addMealItem({
  meal_id,
  recipe_version_id,
  member = null,
  submitter = '家人',
  quantity = 1,
  note = '',
}) {
  const meal = repo.getMeal(meal_id);
  if (!meal) throw new AppError(404, 'MEAL_NOT_FOUND', '这顿饭不存在');
  if (meal.status !== 'open') throw new AppError(409, 'MEAL_CLOSED', '这顿饭已经结束了');
  if (!repo.getVersion(recipe_version_id)) {
    throw new AppError(404, 'RECIPE_VERSION_NOT_FOUND', '菜谱版本不存在');
  }
  const actorName = member ? member.name : submitter;
  const actorId = member ? member.id : '';
  const amount = Number(quantity) || 1;
  if (actorId) {
    repo.upsertMealItemWithSubmission({
      mealId: meal_id,
      versionId: recipe_version_id,
      memberId: actorId,
      memberName: actorName,
      quantity: amount,
      note,
      submittedAt: new Date().toISOString(),
    });
  } else {
    repo.upsertMealItem(meal_id, recipe_version_id, actorName, amount, note);
  }
  return { meal: getMealDetail(meal_id), prep: regeneratePrep(meal_id) };
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
export function deleteInventory(id) {
  const changes = repo.deleteInventoryItem(id);
  if (changes === 0) throw new Error('库存条目不存在');
  return { deleted: true, item_id: id };
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

// ---------- 家庭成员 ----------
export function listMembers() {
  return repo.listMembers();
}

export function identifyMemberById(id) {
  if (!id) return null;
  return repo.getMemberById(id);
}

export function identifyMember(name) {
  const clean = (name || '').trim();
  if (!clean) throw new Error('请先选择「我是谁」');
  const existing = repo.getMemberByName(clean);
  if (existing) return existing;
  // 新名字默认是普通家人（member），颜色随机暖色。
  const palette = ['#5B8C5A', '#D96A3B', '#4F7A4E', '#C94F3D', '#8A6E5A', '#6A8C7B'];
  const color = palette[Math.floor(Math.random() * palette.length)];
  const id = repo.upsertMemberByName(clean, 'member', color);
  return repo.getMemberById(id);
}

const ROLE_BY_KIND = {
  chef: 'chef',
  family: 'member',
};

const COLOR_BY_ROLE = {
  chef: '#D96A3B',
  member: '#5B8C5A',
};

const defaultBindLimiter = createAttemptLimiter();

export function serializeMember(member) {
  return { id: member.id, name: member.name, role: member.role, color: member.color };
}

function normalizeDisplayName(value) {
  const name = String(value || '').trim();
  if (!name || [...name].length > 20) {
    throw new AppError(400, 'INVALID_DISPLAY_NAME', '显示名需为 1 到 20 个字符');
  }
  return name;
}

function issueSession(member, ttlDays) {
  const token = newSessionToken();
  const tokenHash = hashSessionToken(token);
  const createdAt = new Date().toISOString();
  const expiresAt = sessionExpiresAt(ttlDays);
  repo.deleteExpiredSessions(createdAt);
  repo.createAuthSession({ tokenHash, memberId: member.id, createdAt, expiresAt });
  return { status: 'bound', token, expiresAt, member: serializeMember(member) };
}

export async function loginWithWechat({ code, wechatClient, appConfig }) {
  const { openid } = await wechatClient.exchangeCode(code);
  const member = repo.getMemberByOpenid(openid);
  if (!member) return { status: 'needs_binding' };
  return issueSession(member, appConfig.sessionTtlDays);
}

export function listBoundMembers() {
  // 服务层序列化边界：任何调用方拿到的都是脱敏后的成员视图，
  // 不暴露 openid / bound_at / created_at 等字段。
  return repo.listBoundMembers().map(serializeMember);
}

export function changeMemberRole({
  member,
  kind,
  inviteCode,
  appConfig,
  attemptLimiter = defaultBindLimiter,
  attemptKeyPrefix = 'unknown',
}) {
  const attemptKey = `${attemptKeyPrefix}:role:${member.id}:${kind}`;
  attemptLimiter.assertAllowed(attemptKey);
  try {
    verifyBindCode(kind, inviteCode, appConfig);
  } catch (error) {
    if (error.code === 'INVALID_INVITE_CODE') attemptLimiter.recordFailure(attemptKey);
    throw error;
  }
  const role = ROLE_BY_KIND[kind];
  const updated = repo.changeMemberRole({
    memberId: member.id,
    role,
    color: COLOR_BY_ROLE[role],
  });
  attemptLimiter.clear(attemptKey);
  return serializeMember(updated);
}

export async function bindWechatMember({
  code,
  kind,
  inviteCode,
  displayName,
  wechatClient,
  appConfig,
  attemptLimiter = defaultBindLimiter,
  attemptKeyPrefix = 'unknown',
}) {
  const { openid } = await wechatClient.exchangeCode(code);
  const attemptKey = `${attemptKeyPrefix}:${openid}:${kind}`;
  attemptLimiter.assertAllowed(attemptKey);
  try {
    verifyBindCode(kind, inviteCode, appConfig);
  } catch (error) {
    if (error.code === 'INVALID_INVITE_CODE') attemptLimiter.recordFailure(attemptKey);
    throw error;
  }
  const role = ROLE_BY_KIND[kind];
  const member = repo.bindMemberAccount({
    openid,
    role,
    name: normalizeDisplayName(displayName),
    color: COLOR_BY_ROLE[role],
    boundAt: new Date().toISOString(),
  });
  attemptLimiter.clear(attemptKey);
  return issueSession(member, appConfig.sessionTtlDays);
}

export function authenticateToken(token) {
  if (!token) throw new AppError(401, 'UNAUTHORIZED', '请先登录');
  const tokenHash = hashSessionToken(token);
  const session = repo.getAuthSessionByHash(tokenHash);
  if (!session) throw new AppError(401, 'UNAUTHORIZED', '登录已失效');
  if (Date.parse(session.expires_at) <= Date.now()) {
    repo.deleteAuthSession(tokenHash);
    throw new AppError(401, 'UNAUTHORIZED', '登录已过期');
  }
  const member = repo.getMemberById(session.member_id);
  if (!member) throw new AppError(401, 'UNAUTHORIZED', '成员不存在');
  repo.touchAuthSession(tokenHash, new Date().toISOString());
  return { member, session };
}

export function logoutToken(token) {
  if (token) repo.deleteAuthSession(hashSessionToken(token));
}

export function isChef(memberId) {
  const m = repo.getMemberById(memberId);
  return !!m && m.role === 'chef';
}

export function guardChef(memberOrId, action = '该操作') {
  const member = typeof memberOrId === 'string'
    ? repo.getMemberById(memberOrId)
    : memberOrId;
  if (!member || member.role !== 'chef') {
    throw new AppError(403, 'CHEF_ONLY', `${action}只有主厨才能做`);
  }
}

export function memberFromRequest(req) {
  const id = req.headers['x-member-id'] || '';
  return id;
}
