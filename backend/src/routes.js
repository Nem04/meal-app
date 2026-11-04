// HTTP 路由：只做参数解析与转调服务层，不含业务逻辑。
import * as svc from './services.js';
import { ok, created, fail } from './util.js';

export async function handle(req, res, url) {
  const method = req.method;
  const path = url.pathname;
  const seg = path.split('/').filter(Boolean);
  const q = url.searchParams;

  try {
    if (seg[0] === 'meals') return await handleMeals(method, seg, req, res, q);
    if (seg[0] === 'recipes') return await handleRecipes(method, seg, req, res, q);
    if (seg[0] === 'inventory') return await handleInventory(method, seg, req, res, q);
    if (path === '/calendar' && method === 'GET') {
      const year = Number(q.get('year') || new Date().getFullYear());
      const month = Number(q.get('month') || (new Date().getMonth() + 1));
      return ok(res, { days: svc.calendarMonth(year, month), year, month });
    }
    fail(res, 404, '没有这个接口');
  } catch (e) {
    fail(res, 400, e.message || '请求出错');
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { _raw: raw }; }
}

async function handleMeals(method, seg, req, res, q) {
  const id = seg[1];

  if (!id && method === 'GET') return ok(res, svc.listMeals());
  if (!id && method === 'POST') {
    const b = await readBody(req);
    return created(res, svc.openMeal(b));
  }
  if (id && method === 'GET') return ok(res, svc.getMealWithPrep(id));
  if (id && seg[2] === 'items' && method === 'POST') {
    const b = await readBody(req);
    return created(res, svc.addMealItem({ ...b, meal_id: id }));
  }
  if (id && seg[2] === 'prep' && method === 'GET') return ok(res, svc.listPrep(id));
  if (id && seg[2] === 'prep' && seg[3] && method === 'PATCH') {
    const b = await readBody(req);
    return ok(res, svc.togglePrep({ meal_id: id, entry_id: seg[3], prepared: !!b.prepared }));
  }
  if (id && seg[2] === 'prep' && !seg[3] && method === 'PATCH') return ok(res, svc.regeneratePrep(id));
  if (id && method === 'DELETE') return ok(res, svc.deleteMeal(id));
  if (id && seg[2] === 'close' && method === 'PATCH') return ok(res, svc.closeMeal(id));
  if (id && seg[2] === 'log' && method === 'GET') return ok(res, svc.getMealWithPrep(id).log);
  if (id && seg[2] === 'log' && method === 'POST') {
    const b = await readBody(req);
    return created(res, svc.saveMealLog({ meal_id: id, ...b }));
  }
  fail(res, 404, '没有这个饭局接口');
}

function extractVersion(seg) {
  // /recipes/:recipeId/versions/:versionId[/fork]
  if (seg[2] === 'versions' && seg[3]) return seg[3];
  return null;
}

async function handleRecipes(method, seg, req, res, q) {
  const id = seg[1];

  if (!id && method === 'GET') return ok(res, svc.listRecipes(q.get('category') || ''));
  if (!id && method === 'POST') {
    const b = await readBody(req);
    return created(res, svc.createRecipeFromSpecs(b));
  }
  if (id === 'x' && seg[2] === 'versions' && seg[3] && seg[4] === 'fork' && method === 'POST') {
    return created(res, svc.forkRecipeVersion(seg[3]));
  }
  if (id === 'x' && seg[2] === 'versions' && seg[3] && (method === 'PUT' || method === 'PATCH')) {
    const b = await readBody(req);
    return ok(res, svc.overwriteVersion({ versionId: seg[3], ...b }));
  }
  if (id && method === 'DELETE') return ok(res, svc.deleteRecipe(id));
  if (id && method === 'GET') return ok(res, svc.getRecipeDetail(id));
  fail(res, 404, '没有这个菜谱接口');
}

async function handleInventory(method, seg, req, res, q) {
  const isAction = seg[1] === 'parse' || seg[1] === 'bulk';
  const id = isAction ? undefined : seg[1];

  if (!id && method === 'GET') return ok(res, svc.listInventory(q.get('q') || ''));
  if (seg[1] === 'parse' && method === 'POST') {
    const b = await readBody(req);
    return ok(res, svc.parseInventory(b.text || ''));
  }
  if (seg[1] === 'bulk' && method === 'POST') {
    const b = await readBody(req);
    return created(res, svc.bulkAddInventory(b.text || '', b.operator || ''));
  }
  if (!id && method === 'POST') {
    const b = await readBody(req);
    return created(res, svc.inventoryAdd({ ...b, operator: b.operator || '手动录入' }));
  }
  if (id && method === 'PATCH') {
    const b = await readBody(req);
    const op = b.op || q.get('op') || 'stocktake';
    if (op === 'subtract') return ok(res, svc.inventorySubtract({ ...b, id }));
    if (op === 'stocktake') return ok(res, svc.inventoryStocktake({ ...b, id }));
    return ok(res, svc.inventoryAdd({ ...b, operator: b.operator || '手动' }));
  }
  fail(res, 404, '没有这个库存接口');
}

