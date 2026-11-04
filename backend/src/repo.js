// 数据访问层：薄封装 SQLite 读写。业务逻辑不放这里。
import { openDb } from './db.js';
import { AppError } from './errors.js';

export function db() { return openDb(); }

/**
 * 生成 16 位十六进制唯一 ID（用于自建环境，无外部依赖）。
 */
export function newId() {
  let s = '';
  const hex = '0123456789abcdef';
  for (let i = 0; i < 16; i += 1) s += hex[Math.floor(Math.random() * 16)];
  return s;
}

// ---------- recipe ----------
export function listRecipes(category = '') {
  const d = db();
  if (category && category !== '全部') {
    return d.prepare(
      'SELECT r.id, r.name, r.category, r.source, r.current_version_id, ' +
      '(SELECT COUNT(*) FROM ingredient_spec s WHERE s.version_id = r.current_version_id) AS ingredient_count ' +
      'FROM recipe r WHERE r.category = ? ORDER BY r.updated_at DESC'
    ).all(category);
  }
  return d.prepare(
    'SELECT r.id, r.name, r.category, r.source, r.current_version_id, ' +
    '(SELECT COUNT(*) FROM ingredient_spec s WHERE s.version_id = r.current_version_id) AS ingredient_count ' +
    'FROM recipe r ORDER BY r.updated_at DESC'
  ).all();
}

export function getRecipe(id) {
  return db().prepare('SELECT * FROM recipe WHERE id = ?').get(id);
}
export function countRecipeMealReferences(recipeId) {
  const row = db().prepare(
    'SELECT COUNT(*) AS n FROM meal_item mi JOIN recipe_version rv ON rv.id = mi.recipe_version_id ' +
    'WHERE rv.recipe_id = ?'
  ).get(recipeId);
  return row ? Number(row.n) : 0;
}

export function deleteRecipe(id) {
  // 外键级联：recipe_version ON DELETE CASCADE -> ingredient_spec, meal_item 同步删除。
  const r = db().prepare('DELETE FROM recipe WHERE id = ?').run(id);
  return r.changes;
}

export function createRecipe(name, category, source) {
  const d = db();
  const t = new Date().toISOString();
  const id = newId();
  const vid = newId();
  d.prepare(
    'INSERT INTO recipe(id,name,category,source,current_version_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)'
  ).run(id, name, category, source, vid, t, t);
  d.prepare(
    'INSERT INTO recipe_version(id,recipe_id,fork_of_version_id,title,steps,is_base,created_at) VALUES(?,?,NULL,?,?,?,?)'
  ).run(vid, id, '基础版', '', 1, t);
  return { recipe_id: id, version_id: vid };
}

export function getVersion(id) {
  return db().prepare('SELECT * FROM recipe_version WHERE id = ?').get(id);
}

export function listVersionSpecs(versionId) {
  return db().prepare('SELECT * FROM ingredient_spec WHERE version_id = ?').all(versionId);
}

export function setRecipeCurrentVersion(recipeId, versionId) {
  const t = new Date().toISOString();
  db().prepare('UPDATE recipe SET current_version_id = ?, updated_at = ? WHERE id = ?').run(versionId, t, recipeId);
}

export function updateVersionTitle(versionId, title) {
  db().prepare('UPDATE recipe_version SET title = ? WHERE id = ?').run(title, versionId);
}

export function insertSpec(versionId, rawName, canonicalName, quantity, unit, note) {
  db().prepare(
    'INSERT INTO ingredient_spec(id,version_id,raw_name,canonical_name,quantity,unit,note) VALUES(?,?,?,?,?,?,?)'
  ).run(newId(), versionId, rawName, canonicalName, quantity, unit, note || '');
}

export function deleteSpecs(versionId) {
  db().prepare('DELETE FROM ingredient_spec WHERE version_id = ?').run(versionId);
}

export function setVersionSteps(versionId, steps) {
  db().prepare('UPDATE recipe_version SET steps = ? WHERE id = ?').run(steps || '', versionId);
}

export function insertVersion(title, recipeId, steps, forkOf, isBase) {
  const t = new Date().toISOString();
  const id = newId();
  db().prepare(
    'INSERT INTO recipe_version(id,recipe_id,fork_of_version_id,title,steps,is_base,created_at) VALUES(?,?,?,?,?,?,?)'
  ).run(id, recipeId, forkOf || null, title, steps || '', isBase ? 1 : 0, t);
  return id;
}

// ---------- meal ----------
export function listMeals() {
  return db().prepare(
    'SELECT m.*, (SELECT COUNT(*) FROM meal_item i WHERE i.meal_id = m.id) AS item_count ' +
    "FROM meal m ORDER BY (m.status = 'open') DESC, m.meal_date DESC, m.created_at DESC"
  ).all();
}

export function getMeal(id) {
  return db().prepare('SELECT * FROM meal WHERE id = ?').get(id);
}

export function insertMeal(title, mealDate, createdBy) {
  const id = newId();
  const t = new Date().toISOString();
  db().prepare(
    'INSERT INTO meal(id,title,meal_date,status,created_by,created_at,closed_at) VALUES(?,?,?,?,?,?,NULL)'
  ).run(id, title, mealDate, 'open', createdBy || '', t);
  return id;
}

export function updateMealStatus(id, status) {
  const t = status === 'closed' ? new Date().toISOString() : null;
  db().prepare('UPDATE meal SET status = ?, closed_at = ? WHERE id = ?').run(status, t, id);
}

export function deleteMeal(id) {
  // 外键 ON DELETE CASCADE 已覆盖 meal_item / meal_prep_entry / meal_log。
  const r = db().prepare('DELETE FROM meal WHERE id = ?').run(id);
  return r.changes;
}

export function upsertMealItem(mealId, versionId, submitter, quantity, note) {
  const d = db();
  const t = new Date().toISOString();
  const existing = d.prepare(
    'SELECT id FROM meal_item WHERE meal_id = ? AND recipe_version_id = ?'
  ).get(mealId, versionId);
  if (existing) {
    d.prepare('UPDATE meal_item SET note = ?, submitted_at = ?, submitter = ? WHERE id = ?')
      .run(note || '', t, submitter || '', existing.id);
    return existing.id;
  }
  const id = newId();
  d.prepare(
    'INSERT INTO meal_item(id,meal_id,recipe_version_id,submitter,quantity,note,submitted_at) VALUES(?,?,?,?,?,?,?)'
  ).run(id, mealId, versionId, submitter || '', quantity || 1, note || '', t);
  return id;
}

export function listMealItems(mealId) {
  return db().prepare(
    'SELECT i.*, v.title, r.name AS recipe_name, r.category ' +
    'FROM meal_item i JOIN recipe_version v ON v.id = i.recipe_version_id ' +
    'JOIN recipe r ON r.id = v.recipe_id WHERE i.meal_id = ? ORDER BY i.submitted_at ASC'
  ).all(mealId);
}

export function specsForMeal(mealId) {
  return db().prepare(
    'SELECT s.raw_name, s.canonical_name, s.quantity * i.quantity AS quantity, s.unit ' +
    'FROM meal_item i JOIN ingredient_spec s ON s.version_id = i.recipe_version_id WHERE i.meal_id = ?'
  ).all(mealId);
}

// ---------- prep ----------
export function clearPrep(mealId) {
  db().prepare('DELETE FROM meal_prep_entry WHERE meal_id = ?').run(mealId);
}

export function insertPrep(mealId, entry) {
  db().prepare(
    'INSERT INTO meal_prep_entry(id,meal_id,canonical_name,unit,total_quantity,available,shortage,prepared,prepared_at) ' +
    'VALUES(?,?,?,?,?,?,?,0,NULL)'
  ).run(newId(), mealId, entry.canonical_name, entry.unit, entry.total_quantity, entry.available, entry.shortage);
}

export function listPrep(mealId) {
  return db().prepare('SELECT * FROM meal_prep_entry WHERE meal_id = ? ORDER BY shortage DESC, canonical_name ASC').all(mealId);
}

export function setPrepPrepared(entryId, mealId, prepared) {
  const t = prepared ? new Date().toISOString() : null;
  return db().prepare('UPDATE meal_prep_entry SET prepared = ?, prepared_at = ? WHERE id = ? AND meal_id = ?')
    .run(prepared ? 1 : 0, t, entryId, mealId);
}

// ---------- inventory ----------
export function listInventory(search = '') {
  const d = db();
  if (search) {
    return d.prepare(
      'SELECT * FROM inventory_item WHERE canonical_name LIKE ? OR note LIKE ? ORDER BY canonical_name ASC'
    ).all(`%${search}%`, `%${search}%`);
  }
  return d.prepare('SELECT * FROM inventory_item ORDER BY canonical_name ASC').all();
}

export function getInventoryItem(name, unit) {
  return db().prepare('SELECT * FROM inventory_item WHERE canonical_name = ? AND unit = ?').get(name, unit);
}

export function inventorySnapshot() {
  return db().prepare('SELECT canonical_name, unit, quantity FROM inventory_item ORDER BY canonical_name, unit').all();
}

export function upsertInventoryItem(name, quantity, unit, by, note) {
  const d = db();
  const t = new Date().toISOString();
  const existing = d.prepare('SELECT id FROM inventory_item WHERE canonical_name = ? AND unit = ?').get(name, unit);
  if (existing) return existing.id;
  const id = newId();
  d.prepare(
    'INSERT INTO inventory_item(id,canonical_name,quantity,unit,note,updated_by,updated_at) VALUES(?,?,?,?,?,?,?)'
  ).run(id, name, quantity, unit, note || '', by || '', t);
  return id;
}

export function applyInventoryOp(itemId, op, delta, note, operator) {
  const d = db();
  const item = d.prepare('SELECT * FROM inventory_item WHERE id = ?').get(itemId);
  if (!item) throw new Error('库存条目不存在');
  let newQty = Number(item.quantity);
  if (op === 'add') newQty += Number(delta);
  else if (op === 'subtract') newQty -= Number(delta);
  else if (op === 'stocktake') newQty = Number(delta);
  else throw new Error('未知库存操作: ' + op);
  const t = new Date().toISOString();
  d.prepare('UPDATE inventory_item SET quantity = ?, updated_by = ?, updated_at = ? WHERE id = ?')
    .run(roundQty(newQty), operator || '', t, itemId);
  d.prepare('INSERT INTO inventory_log(id,item_id,op,delta,note,operator,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(newId(), itemId, op, Number(delta), note || '', operator || '', t);
  return { item_id: itemId, quantity: roundQty(newQty) };
}
export function deleteInventoryItem(itemId) {
  const r = db().prepare('DELETE FROM inventory_item WHERE id = ?').run(itemId);
  return r.changes;
}

// ---------- log ----------
export function upsertMealLog(mealId, sentence, rating) {
  const d = db();
  const t = new Date().toISOString();
  const existing = d.prepare('SELECT id FROM meal_log WHERE meal_id = ?').get(mealId);
  if (existing) {
    d.prepare('UPDATE meal_log SET sentence = ?, rating = ?, updated_at = ? WHERE id = ?')
      .run(sentence || '', rating || '', t, existing.id);
    return existing.id;
  }
  const id = newId();
  d.prepare('INSERT INTO meal_log(id,meal_id,sentence,rating,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run(id, mealId, sentence || '', rating || '', t, t);
  return id;
}

export function getMealLog(mealId) {
  return db().prepare('SELECT * FROM meal_log WHERE meal_id = ?').get(mealId);
}

export function mealsForMonth(year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return db().prepare(
    'SELECT m.*, l.sentence, l.rating FROM meal m LEFT JOIN meal_log l ON l.meal_id = m.id ' +
    'WHERE m.meal_date LIKE ? ORDER BY m.meal_date ASC'
  ).all(`${prefix}%`);
}

function roundQty(n) { return Math.round(n * 100) / 100; }

// ---------- family_member ----------
export function listMembers() {
  return db().prepare('SELECT * FROM family_member ORDER BY role DESC, created_at ASC').all();
}

export function getMemberById(id) {
  return db().prepare('SELECT * FROM family_member WHERE id = ?').get(id);
}

export function getMemberByName(name) {
  return db().prepare('SELECT * FROM family_member WHERE name = ?').get(name);
}

export function upsertMemberByName(name, role, color) {
  const d = db();
  const existing = d.prepare('SELECT id FROM family_member WHERE name = ?').get(name);
  if (existing) {
    d.prepare('UPDATE family_member SET role = ?, color = ? WHERE id = ?').run(role, color, existing.id);
    return existing.id;
  }
  const t = new Date().toISOString();
  const id = newId();
  d.prepare('INSERT INTO family_member(id,name,role,color,openid,created_at) VALUES(?,?,?,?,NULL,?)')
    .run(id, name, role, color, t);
  return id;
}

export function getMemberByOpenid(openid) {
  return db().prepare('SELECT * FROM family_member WHERE openid = ?').get(openid);
}

export function bindMemberSlot({ openid, memberId, name, boundAt }) {
  const d = db();
  d.exec('BEGIN IMMEDIATE');
  try {
    const member = d.prepare('SELECT * FROM family_member WHERE id = ?').get(memberId);
    if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', '成员槽位不存在');
    if (member.openid) throw new AppError(409, 'MEMBER_ALREADY_BOUND', '这个成员槽位已经绑定');
    const other = d.prepare(
      'SELECT id FROM family_member WHERE openid = ? AND id <> ?',
    ).get(openid, memberId);
    if (other) throw new AppError(409, 'OPENID_ALREADY_BOUND', '这个微信已经绑定其他成员');
    d.prepare(
      'UPDATE family_member SET openid = ?, name = ?, bound_at = ? WHERE id = ?',
    ).run(openid, name, boundAt, memberId);
    d.exec('COMMIT');
    return d.prepare('SELECT * FROM family_member WHERE id = ?').get(memberId);
  } catch (error) {
    d.exec('ROLLBACK');
    throw error;
  }
}

export function createAuthSession({ tokenHash, memberId, createdAt, expiresAt }) {
  db().prepare(
    'INSERT INTO auth_session(token_hash, member_id, created_at, expires_at, last_seen_at) VALUES(?,?,?,?,?)',
  ).run(tokenHash, memberId, createdAt, expiresAt, createdAt);
}

export function getAuthSessionByHash(tokenHash) {
  return db().prepare('SELECT * FROM auth_session WHERE token_hash = ?').get(tokenHash);
}

export function touchAuthSession(tokenHash, lastSeenAt) {
  db().prepare('UPDATE auth_session SET last_seen_at = ? WHERE token_hash = ?')
    .run(lastSeenAt, tokenHash);
}

export function deleteAuthSession(tokenHash) {
  return db().prepare('DELETE FROM auth_session WHERE token_hash = ?').run(tokenHash).changes;
}

export function deleteExpiredSessions(nowIso) {
  return db().prepare('DELETE FROM auth_session WHERE expires_at <= ?').run(nowIso).changes;
}

export function upsertMealSubmission({
  mealId, versionId, memberId, memberName, quantity, note, submittedAt,
}) {
  const d = db();
  const existing = d.prepare(
    'SELECT id FROM meal_item_submission WHERE meal_id = ? AND recipe_version_id = ? AND member_id = ?',
  ).get(mealId, versionId, memberId);
  if (existing) {
    d.prepare(
      'UPDATE meal_item_submission SET member_name_snapshot = ?, quantity = ?, note = ?, submitted_at = ? WHERE id = ?',
    ).run(memberName, quantity, note, submittedAt, existing.id);
    return existing.id;
  }
  const id = newId();
  d.prepare(
    'INSERT INTO meal_item_submission(id, meal_id, recipe_version_id, member_id, member_name_snapshot, quantity, note, submitted_at) VALUES(?,?,?,?,?,?,?,?)',
  ).run(id, mealId, versionId, memberId, memberName, quantity, note, submittedAt);
  return id;
}

export function listMealSubmissions(mealId) {
  return db().prepare(
    'SELECT id, meal_id, recipe_version_id, member_id, member_name_snapshot, quantity, note, submitted_at FROM meal_item_submission WHERE meal_id = ? ORDER BY submitted_at ASC',
  ).all(mealId);
}

export function upsertMealItemWithSubmission({
  mealId, versionId, memberId, memberName, quantity, note, submittedAt,
}) {
  const d = db();
  d.exec('BEGIN IMMEDIATE');
  try {
    const itemId = upsertMealItem(mealId, versionId, memberName, quantity, note);
    upsertMealSubmission({
      mealId,
      versionId,
      memberId,
      memberName,
      quantity,
      note,
      submittedAt,
    });
    d.exec('COMMIT');
    return itemId;
  } catch (error) {
    d.exec('ROLLBACK');
    throw error;
  }
}
