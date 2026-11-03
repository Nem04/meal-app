// 家庭点菜 · 前端 SPA（无构建，原生 JS）。
const API = '/api';
let state = { tab: 'today', category: '全部', search: '', calendarYear: 0, calendarMonth: 0 };

const view = document.getElementById('view');
const toastEl = document.getElementById('toast');
const sheetEl = document.getElementById('sheet');
const sheetMaskEl = document.getElementById('sheet-mask');
const tabs = document.querySelectorAll('.tab');

// ---------- 基础 ----------
async function api(path, method = 'GET', body, passcode) {
  const headers = { 'Content-Type': 'application/json' };
  if (passcode) headers['x-family-passcode'] = passcode;
  const resp = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    let msg = '请求失败';
    try { const j = await resp.json(); if (j && j.data && j.data.error) msg = j.data.error; } catch {}
    const err = new Error(msg);
    err.status = resp.status;
    throw err;
  }
  const j = await resp.json();
  return j.data;
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 2000);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function localDateStr(d) {
  const x = d || new Date();
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function openSheet(html) {
  sheetEl.innerHTML = html;
  sheetEl.hidden = false;
  sheetMaskEl.hidden = false;
}
function closeSheet() {
  sheetEl.hidden = true;
  sheetMaskEl.hidden = true;
  sheetEl.innerHTML = '';
}
sheetMaskEl.addEventListener('click', closeSheet);

function render(t) {
  state.tab = t;
  tabs.forEach((x) => x.classList.toggle('on', x.dataset.tab === t));
  if (t === 'today') return renderToday();
  if (t === 'recipes') return renderRecipes();
  if (t === 'inventory') return renderInventory();
  if (t === 'log') return renderLog();
}

function setGreet() {
  const h = new Date().getHours();
  let g = '傍晚好，今晚想吃什么？';
  if (h < 5) g = '夜深了，早点休息～';
  else if (h < 11) g = '早上好，今天吃点什么？';
  else if (h < 14) g = '中午好，午饭吃了吗？';
  else if (h < 18) g = '下午好，晚上想吃什么？';
  document.getElementById('greet').textContent = g;
}

// ---------- 今天吃啥 ----------
async function renderToday() {
  view.innerHTML = `<div class="view-inner" id="today-body"><div class="empty">加载中…</div></div>`;
  const meals = await api('/meals');
  const open = meals.filter((m) => m.status === 'open');
  const closed = meals.filter((m) => m.status !== 'open');

  const hero = open.length
    ? open.map((m) => `
      <div class="hero-card">
        <span class="tag">🔥 进行中</span>
        <h3>${esc(m.title)}</h3>
        <p>${esc(m.meal_date)} · ${m.item_count} 道菜</p>
        <div class="hero-actions">
          <button class="btn btn-light" onclick="goMeal('${m.id}')">去点菜</button>
          <button class="btn btn-ghost" onclick="goPrep('${m.id}')">看备菜清单</button>
        </div>
      </div>`).join('')
    : `<div class="hero-card"><span class="tag">🍳 没有进行中的饭</span><h3>今晚吃什么？</h3><p>开一顿饭，让家人一起来点。</p><div class="hero-actions"><button class="btn btn-light" onclick="openMealForm()">开一顿饭</button></div></div>`;

  const closedHtml = closed.length
    ? closed.slice(0, 8).map((m) => `
      <div class="row"><div class="emoji">🍲</div><div class="body"><div class="title">${esc(m.title)}</div><div class="meta">${esc(m.meal_date)} · ${m.item_count} 道菜</div></div><button class="mini-btn plain" onclick="confirmDeleteMeal('${m.id}','${esc(m.title)}')">删除</button></div>`).join('')
    : `<div class="empty">还没有吃过记录</div>`;

  document.getElementById('today-body').innerHTML = hero + `<div class="section-head"><h4>最近吃过的</h4><span onclick="render('log')">查看月历 ›</span></div>` + closedHtml;
}

window.goMeal = async function(id) {
  const meal = await api(`/meals/${id}`);
  openSheet(await mealDetailHtml(meal, id));
};

window.goPrep = async function(id) {
  const meal = await api(`/meals/${id}`);
  openSheet(await prepHtml(meal, id));
};

window.openMealForm = function() {
  openSheet(`
    <h3>开一顿饭 <button class="close-x" onclick="closeSheet()">×</button></h3>
    <input class="input" id="meal-title" placeholder="饭名，默认「今晚这顿饭」">
    <input class="input" id="meal-date" type="date" value="${localDateStr()}">
    <input class="input" id="meal-by" placeholder="主厨昵称（可选）">
    <button class="primary-btn" onclick="doOpenMeal()">开饭</button>
  `);
};

window.doOpenMeal = async function() {
  const title = document.getElementById('meal-title').value.trim();
  const meal_date = document.getElementById('meal-date').value;
  const created_by = document.getElementById('meal-by').value.trim();
  await api('/meals', 'POST', { title, meal_date, created_by });
  closeSheet();
  toast('这顿饭开好啦 🍳');
  render('today');
};

window.goAddDish = async function(mealId, category = '') {
  const list = await api(`/recipes${category ? '?category=' + encodeURIComponent(category) : ''}`);
  const recipes = list || [];
  openSheet(`
    <h3>加一道菜 <button class="close-x" onclick="closeSheet()">×</button></h3>
    <div class="chipbar">
      ${['全部','荤','素','汤','主食','凉菜','其他'].map((c) => `<button class="chip ${state.category === c ? 'on' : ''}" onclick="state.category='${c}';goAddDish('${mealId}','${c}')">${c}</button>`).join('')}
    </div>
    <div style="max-height:46vh;overflow:auto;">
      ${recipes.length ? recipes.map((r) => `
        <div class="row"><div class="emoji">🍽</div><div class="body"><div class="title">${esc(r.name)}</div><div class="meta">${esc(r.category)} · ${r.ingredient_count || 0} 种食材</div></div><button class="mini-btn green" onclick="doAddDish('${mealId}','${r.current_version_id}')">点这道</button></div>
      `).join('') : `<div class="empty">还没有菜谱，先去「菜谱」建一道吧</div>`}
    </div>
  `);
};
window.state = state;

window.doAddDish = async function(mealId, versionId) {
  const note = '';
  try {
    await api(`/meals/${mealId}/items`, 'POST', { recipe_version_id: versionId, submitter: '家人', quantity: 1, note });
    toast('已点上这道菜 ✅');
    closeSheet();
    const meal = await api(`/meals/${mealId}`);
    openSheet(await mealDetailHtml(meal, mealId));
  } catch (e) { toast(e.message); }
};

async function mealDetailHtml(meal, id) {
  const items = meal.items || [];
  return `
    <h3>${esc(meal.title)} <button class="close-x" onclick="closeSheet()">×</button></h3>
    <div class="muted">${esc(meal.meal_date)} · ${meal.status === 'open' ? '进行中' : '已结束'}</div>
    <div style="margin:10px 0;">
      ${items.length ? items.map((i) => `
        <div class="row"><div class="emoji">🫕</div><div class="body"><div class="title">${esc(i.recipe_name)}</div><div class="meta">${esc(i.note || '') || i.submitter}</div></div></div>
      `).join('') : `<div class="empty">还没有点菜，点下方「加一道菜」</div>`}
    </div>
    <button class="primary-btn" onclick="goAddDish('${id}')">＋ 加一道菜</button>
    <button class="secondary-btn" onclick="goPrep('${id}')">看备菜清单 →</button>
    <button class="secondary-btn" onclick="doCloseMeal('${id}')">${meal.status === 'open' ? '结束这顿饭' : '已结束'}</button>
  `;
}

window.doCloseMeal = async function(id) {
  await api(`/meals/${id}/close`, 'PATCH', {});
  toast('这顿饭结束了 ✅');
  closeSheet();
  render('today');
};
window.confirmDeleteMeal = function(id, title) {
  const safeTitle = esc(title || '');
  openSheet(`
    <h3>删除这顿饭<button class="close-x" onclick="closeSheet()">×</button></h3>
    <p class="muted">确定删除「${safeTitle}」吗？</p>
    <p class="muted" style="margin-bottom:12px">删除后，这顿饭、点菜记录、备菜条目和日志会一起删掉，无法恢复。</p>
    <button class="primary-btn" style="background:var(--danger)" onclick="doDeleteMeal('${id}')">删除</button>
    <button class="secondary-btn" onclick="closeSheet()">取消</button>
  `);
};

window.doDeleteMeal = async function(id) {
  await api(`/meals/${id}`, 'DELETE', {});
  toast('已删除这顿饭 🗑');
  closeSheet();
  render('today');
};

async function prepHtml(meal, id) {
  let prep = meal.prep;
  if (!prep || !prep.entries) { prep = await api(`/meals/${id}/prep`); }
  const total = prep.total || 0;
  const prepared = prep.prepared || 0;
  const missing = prep.missing || 0;
  const entries = prep.entries || [];
  const rows = entries.map((e) => `
    <div class="row">
      <div class="emoji">🧺</div>
      <div class="body">
        <div class="title">${esc(e.canonical_name)} <span class="pill ${e.shortage > 0 ? 'red' : 'green'}">${e.shortage > 0 ? '缺' : '够'}</span></div>
        <div class="meta">需 ${e.total_quantity} ${esc(e.unit)} · 库存 ${e.available === null ? '无' : e.available + ' ' + esc(e.unit)}${e.shortage > 0 ? ` · <b style="color:var(--danger)">缺 ${e.shortage}</b>` : ''}</div>
        ${e.cross_unit_note ? `<div class="meta" style="color:var(--tomato)">⚠️ ${esc(e.cross_unit_note)}</div>` : ''}
      </div>
      <button class="toggle ${e.prepared ? 'on' : ''}" onclick="togglePrep('${id}','${e.id}',${e.prepared ? 0 : 1})"></button>
    </div>`).join('');

  return `
    <h3>备菜清单 <button class="close-x" onclick="closeSheet()">×</button></h3>
    <div class="prep-summary">
      <div class="stat"><b>${prepared}/${total}</b><span>已备齐</span></div>
      <div class="stat good"><b>${total - missing}</b><span>库存够</span></div>
      <div class="stat warn"><b>${missing}</b><span>还缺</span></div>
    </div>
    <div class="muted" style="margin-bottom:10px">勾选只表示「备齐了」，不会扣库存。</div>
    <div style="max-height:52vh;overflow:auto;">${rows || '<div class="empty">还没有食材</div>'}</div>
  `;
}

window.togglePrep = async function(mealId, entryId, prepared) {
  await api(`/meals/${mealId}/prep/${entryId}`, 'PATCH', { prepared: !!prepared });
  const meal = await api(`/meals/${mealId}`);
  openSheet(await prepHtml(meal, mealId));
};

// ---------- 菜谱 ----------
async function renderRecipes() {
  view.innerHTML = `<div class="view-inner"><div id="recipe-body"><div class="empty">加载中…</div></div></div>`;
  await refreshRecipes();
}

async function refreshRecipes() {
  const list = await api(`/recipes?category=${encodeURIComponent(state.category)}`);
  const body = document.getElementById('recipe-body');
  body.innerHTML = `
    <div class="chipbar">
      ${['全部','荤','素','汤','主食','凉菜','其他'].map((c) => `<button class="chip ${state.category === c ? 'on' : ''}" onclick="pickCategory('${c}')">${c}</button>`).join('')}
    </div>
    <button class="primary-btn" onclick="newRecipeForm()">＋ 新建菜谱</button>
    <div class="recipe-grid">
      ${(list || []).map((r) => `
        <div class="recipe-card">
          <div class="name">${esc(r.name)}</div>
          <div class="meta">${esc(r.category)} · ${r.ingredient_count || 0} 种食材</div>
          <div class="actions">
            <button class="mini-btn plain" onclick="openRecipe('${r.id}')">查看</button>
            <button class="mini-btn green" onclick="addToOpenMeal('${r.id}')">加餐</button>
          </div>
        </div>`).join('') || '<div class="empty">还没有菜谱</div>'}
    </div>
  `;
}

window.pickCategory = function(c) { state.category = c; refreshRecipes(); };

window.newRecipeForm = function() {
  openSheet(`
    <h3>新建菜谱 <button class="close-x" onclick="closeSheet()">×</button></h3>
    <input class="input" id="rc-name" placeholder="菜名，如 番茄炒蛋">
    <input class="input" id="rc-category" placeholder="分类：素 / 荤 / 汤 / 主食 / 凉菜">
    <textarea class="input" id="rc-ing" placeholder="食材，每行一个：名称+数量+单位，如&#10;番茄 2 个&#10;鸡蛋 3 个&#10;小葱 1 根"></textarea>
    <textarea class="input" id="rc-steps" placeholder="步骤（可选）"></textarea>
    <button class="primary-btn" onclick="doNewRecipe()">保存菜谱</button>
  `);
};

window.doNewRecipe = async function() {
  const name = document.getElementById('rc-name').value.trim();
  const category = document.getElementById('rc-category').value.trim() || '其他';
  const steps = document.getElementById('rc-steps').value.trim();
  const ingText = document.getElementById('rc-ing').value.trim();
  const specs = ingText.split('\n').map((line) => {
    const m = line.trim().match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(\S*)$/);
    if (m) return { raw_name: m[1], quantity: Number(m[2]), unit: m[3] || '' };
    const m2 = line.trim().match(/^(.+)$/);
    return m2 ? { raw_name: m2[1], quantity: 1, unit: '' } : null;
  }).filter(Boolean);
  if (!name) return toast('先填菜名');
  await api('/recipes', 'POST', { name, category, steps, specs });
  closeSheet();
  toast('菜谱保存好了 📖');
  refreshRecipes();
};

window.openRecipe = async function(id) {
  const r = await api(`/recipes/${id}`);
  const specs = r.specs || [];
  const vids = (r.versions || []).map((v) => v.id);
  openSheet(`
    <h3>${esc(r.name)} <button class="close-x" onclick="closeSheet()">×</button></h3>
    <div class="muted">${esc(r.category)} · ${esc(r.source)}</div>
    <div style="margin:10px 0;">
      <div class="section-head"><h4>食材</h4></div>
      ${specs.map((s) => `<div class="parse-item"><span>${esc(s.raw_name)}</span><span class="qty">${s.quantity} ${esc(s.unit)}</span></div>`).join('') || '<div class="empty">暂无食材</div>'}
      ${r.current_version && r.current_version.steps ? `<div class="section-head"><h4>步骤</h4></div><div class="muted" style="white-space:pre-line">${esc(r.current_version.steps)}</div>` : ''}
    </div>
    <button class="primary-btn" onclick="forkRecipe('${r.current_version ? r.current_version.id : ''}')">另存为我家版 ✨</button>
    <button class="secondary-btn" onclick="editRecipe('${r.current_version ? r.current_version.id : ''}','${r.id}')">编辑我家版</button>
  `);
};

window.forkRecipe = async function(versionId) {
  if (!versionId) return toast('菜谱没有可用版本');
  const res = await api(`/recipes/x/versions/${versionId}/fork`, 'POST', {});
  closeSheet();
  toast('已另存为我家版 ✨');
  refreshRecipes();
};

window.editRecipe = function(versionId, recipeId) {
  openSheet(`
    <h3>编辑菜谱 <button class="close-x" onclick="closeSheet()">×</button></h3>
    <textarea class="input" id="ed-ing" placeholder="食材，每行：名称 数量 单位"></textarea>
    <textarea class="input" id="ed-steps" placeholder="步骤"></textarea>
    <button class="primary-btn" onclick="doEditRecipe('${versionId}')">保存修改</button>
  `);
};

window.doEditRecipe = async function(versionId) {
  const ingText = document.getElementById('ed-ing').value.trim();
  const steps = document.getElementById('ed-steps').value.trim();
  const specs = ingText.split('\n').map((line) => {
    const m = line.trim().match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(\S*)$/);
    if (m) return { raw_name: m[1], quantity: Number(m[2]), unit: m[3] || '' };
    return { raw_name: line.trim(), quantity: 1, unit: '' };
  }).filter((s) => s.raw_name);
  await api(`/recipes/x/versions/${versionId}`, 'PUT', { steps, specs });
  closeSheet();
  toast('改好啦 ✅（原版不受影响）');
  refreshRecipes();
};

window.addToOpenMeal = async function(recipeId) {
  const meals = await api('/meals');
  const open = meals.find((m) => m.status === 'open');
  if (!open) return toast('先开一顿饭吧 🍳');
  const r = await api(`/recipes/${recipeId}`);
  await api(`/meals/${open.id}/items`, 'POST', { recipe_version_id: r.current_version.id, quantity: 1, note: '' });
  toast('已加入这顿饭 ✅');
};

// ---------- 库存 ----------
async function renderInventory() {
  view.innerHTML = `<div class="view-inner" id="inv-body"><div class="empty">加载中…</div></div>`;
  await refreshInventory();
}

async function refreshInventory() {
  const list = await api(`/inventory?q=${encodeURIComponent(state.search)}`);
  const body = document.getElementById('inv-body');
  body.innerHTML = `
    <input class="input" placeholder="🔍 搜索库存" id="inv-search">
    <button class="primary-btn" onclick="bulkForm()">📋 整段粘贴录入</button>
    <div class="section-head"><h4>库存清单（${list ? list.length : 0} 项）</h4></div>
    ${(list || []).map((i) => `
      <div class="row"><div class="emoji">🥫</div><div class="body"><div class="title">${esc(i.canonical_name)}</div><div class="meta">${i.quantity} ${esc(i.unit)}${i.note ? ' · ' + esc(i.note) : ''}</div></div><button class="mini-btn plain" onclick="editStock('${i.id}','${i.canonical_name}','${i.quantity}','${i.unit}')">改</button></div>
    `).join('') || '<div class="empty">库存空空的，先粘贴录入吧</div>'}
  `;
  const s = document.getElementById('inv-search');
  s.onchange = () => { state.search = s.value; refreshInventory(); };
  s.onkeyup = (e) => { if (e.key === 'Enter') { state.search = s.value; refreshInventory(); } };
}

window.bulkForm = function() {
  openSheet(`
    <h3>整段粘贴录入 <button class="close-x" onclick="closeSheet()">×</button></h3>
    <textarea class="input" id="bulk-text" placeholder="芹菜一斤，酱油一瓶、鸡蛋十个"></textarea>
    <div class="muted" style="margin-bottom:10px">用逗号、顿号或换行分隔，自动识别名称 + 数量 + 单位。</div>
    <button class="primary-btn" onclick="parseBulk()">解析并预览</button>
  `);
};

window.parseBulk = async function() {
  const text = document.getElementById('bulk-text').value.trim();
  const res = await api('/inventory/parse', 'POST', { text });
  const failedHtml = res.failed && res.failed.length ? `<div class="muted" style="color:var(--danger)">待确认：${res.failed.map(esc).join('、')}</div>` : '';
  openSheet(`
    <h3>识别结果 <button class="close-x" onclick="closeSheet()">×</button></h3>
    <div class="parse-preview">
      <div class="pt">识别出 ${res.items.length} 条（确认后才会入库）</div>
      ${res.items.map((i) => `<div class="parse-item"><span>${esc(i.name)}</span><span class="qty">${i.quantity} ${esc(i.unit)}</span></div>`).join('')}
      ${res.items.length ? '' : '<div class="empty">没有识别到条目</div>'}
      ${failedHtml}
    </div>
    ${res.items.length ? `<button class="primary-btn orange" onclick="confirmBulk('${encodeURIComponent(text)}')">确认入库</button>` : ''}
    <button class="secondary-btn" onclick="bulkForm()">返回修改</button>
  `);
};

window.confirmBulk = async function(textEnc) {
  const text = decodeURIComponent(textEnc);
  const res = await api('/inventory/bulk', 'POST', { text });
  closeSheet();
  toast(`已入库 ${res.saved.length} 条 ✅`);
  refreshInventory();
};

window.editStock = function(id, name, qty, unit) {
  openSheet(`
    <h3>改库存 · ${esc(name)} <button class="close-x" onclick="closeSheet()">×</button></h3>
    <div class="muted" style="margin-bottom:10px">直接改数量 = 盘点；不会自动扣减。</div>
    <input class="input" id="st-qty" type="number" step="0.1" value="${qty}">
    <button class="primary-btn" onclick="doStocktake('${id}')">存为新数量（盘点）</button>
    <button class="secondary-btn" onclick="doSubtract('${id}')">按差值出库</button>
  `);
};

window.doStocktake = async function(id) {
  const quantity = Number(document.getElementById('st-qty').value);
  await api(`/inventory/${id}`, 'PATCH', { op: 'stocktake', quantity });
  closeSheet(); toast('库存已更新 ✅'); refreshInventory();
};

window.doSubtract = async function(id) {
  const quantity = Number(document.getElementById('st-qty').value);
  await api(`/inventory/${id}`, 'PATCH', { op: 'subtract', quantity });
  closeSheet(); toast('已出库 ✅'); refreshInventory();
};

// ---------- 日志 / 月历 ----------
async function renderLog() {
  const now = new Date();
  state.calendarYear = now.getFullYear();
  state.calendarMonth = now.getMonth() + 1;
  view.innerHTML = `<div class="view-inner" id="log-body"><div class="empty">加载中…</div></div>`;
  await refreshLog();
}

async function refreshLog() {
  const year = state.calendarYear;
  const month = state.calendarMonth;
  const res = await api(`/calendar?year=${year}&month=${month}`);
  const days = res.days || [];
  const byDay = new Map();
  for (const d of days) { byDay.set(d.meal_date, d); }

  const first = new Date(year, month - 1, 1);
  const dow = first.getDay(); // 0=周日
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < dow; i += 1) cells.push(`<div class="cal-cell other"></div>`);
  const todayStr = localDateStr();
  for (let d = 1; d <= daysInMonth; d += 1) {
    const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const meal = byDay.get(ds);
    const has = !!meal;
    const today = ds === todayStr ? ' today' : '';
    cells.push(`<div class="cal-cell ${has ? 'has' : ''}${today}" ${has ? `onclick="openDay('${ds}')"` : ''}>
      <div class="d">${d}</div>
      <div class="dotrow">${has ? '<span class="dot"></span>' : ''}</div>
    </div>`);
  }
  const dows = ['日','一','二','三','四','五','六'];

  document.getElementById('log-body').innerHTML = `
    <div class="cal-head">
      <button class="nav" onclick="calNav(-1)">‹ 上月</button>
      <div style="font-weight:800;font-size:16px">${year} 年 ${month} 月</div>
      <button class="nav" onclick="calNav(1)">下月 ›</button>
    </div>
    <div class="cal-grid">
      ${dows.map((w) => `<div class="cal-dow">${w}</div>`).join('')}
      ${cells.join('')}
    </div>
    <div class="section-head"><h4>这个月吃过的（${days.length} 顿）</h4></div>
    ${days.map((m) => `
      <div class="row"><div class="emoji">🍽</div><div class="body"><div class="title">${esc(m.title)}</div><div class="meta">${esc(m.meal_date)}${m.sentence ? ' · “' + esc(m.sentence) + '”' : ''}${m.rating ? ' · ' + esc(m.rating) : ''}</div></div><button class="mini-btn plain" onclick="leaveLog('${m.id}')">留话</button></div>
    `).join('') || '<div class="empty">这个月还没有记录</div>'}
  `;
}

window.calNav = function(delta) {
  let m = state.calendarMonth + delta;
  let y = state.calendarYear;
  if (m < 1) { m = 12; y -= 1; }
  if (m > 12) { m = 1; y += 1; }
  state.calendarYear = y;
  state.calendarMonth = m;
  refreshLog();
};

window.openDay = function(ds) {
  toast(ds + ' · 点下方留话可以补记哦');
};

window.leaveLog = async function(mealId) {
  openSheet(`
    <h3>吃完留一句话 <button class="close-x" onclick="closeSheet()">×</button></h3>
    <input class="input" id="lg-sentence" placeholder="今天这顿怎么样？">
    <div class="chipbar">
      <button class="chip on" onclick="pickRating('好吃')">好吃</button>
      <button class="chip" onclick="pickRating('一般')">一般</button>
      <button class="chip" onclick="pickRating('踩雷')">踩雷</button>
    </div>
    <button class="primary-btn" onclick="doLeaveLog('${mealId}')">保存</button>
  `);
  window._rating = '好吃';
};

window.pickRating = function(r) {
  window._rating = r;
  document.querySelectorAll('.sheet .chip').forEach((c) => c.classList.toggle('on', c.textContent === r));
};

window.doLeaveLog = async function(mealId) {
  const sentence = document.getElementById('lg-sentence').value.trim();
  const rating = window._rating || '';
  await api(`/meals/${mealId}/log`, 'POST', { sentence, rating });
  closeSheet(); toast('记下啦 ✅'); refreshLog();
};

// ---------- 启动 ----------
setGreet();
tabs.forEach((t) => t.addEventListener('click', () => render(t.dataset.tab)));
render('today');
