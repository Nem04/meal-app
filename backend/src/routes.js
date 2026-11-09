// HTTP 路由：只做参数解析与转调服务层，不含业务逻辑。
import * as svc from './services.js';
import { ok, created, fail } from './util.js';
import { config } from './config.js';
import { AppError } from './errors.js';
import { bearerToken } from './auth/request.js';
import { createWechatClient } from './auth/wechat.js';

const defaultWechatClient = createWechatClient({
  appId: config.wxAppId,
  appSecret: config.wxSecret,
});

function requireIdentity(req) {
  if (req.member) return req.member;
  if (config.authMode === 'legacy') {
    const member = svc.identifyMemberById(req.headers['x-member-id'] || '');
    if (!member) throw new AppError(401, 'UNAUTHORIZED', '请先选择身份');
    req.member = member;
    return member;
  }
  const auth = svc.authenticateToken(bearerToken(req));
  req.member = auth.member;
  req.session = auth.session;
  return auth.member;
}

function guardChef(req) {
  svc.guardChef(requireIdentity(req));
}

export async function handle(req, res, url, deps = {}) {
  const method = req.method;
  const path = url.pathname;
  const seg = path.split('/').filter(Boolean);
  const q = url.searchParams;
  try {
    if (path === '/health' && method === 'GET') {
      svc.healthCheck();
      return ok(res, { status: 'ok' });
    }
    if (seg[0] === 'auth') {
      return await handleAuth(method, seg, req, res, deps.wechatClient || defaultWechatClient);
    }
    if (seg[0] === 'meals') {
      requireIdentity(req);
      return await handleMeals(method, seg, req, res, q);
    }
    if (seg[0] === 'recipes') {
      requireIdentity(req);
      return await handleRecipes(method, seg, req, res, q);
    }
    if (seg[0] === 'inventory') {
      requireIdentity(req);
      return await handleInventory(method, seg, req, res, q);
    }
    if (seg[0] === 'members') {
      requireIdentity(req);
      return await handleMembers(method, seg, req, res, q);
    }
    if (path === '/calendar' && method === 'GET') {
      requireIdentity(req);
      const year = Number(q.get('year') || new Date().getFullYear());
      const month = Number(q.get('month') || new Date().getMonth() + 1);
      return ok(res, { days: svc.calendarMonth(year, month), year, month });
    }
    fail(res, 404, '没有这个接口');
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 400;
    fail(res, status, error.message || '请求出错', error.code || 'BAD_REQUEST');
  }
}

async function handleAuth(method, seg, req, res, wechatClient) {
  const appConfig = {
    chefBindCode: config.chefBindCode,
    familyInviteCode: config.familyInviteCode,
    sessionTtlDays: config.sessionTtlDays,
  };
  if (seg[1] === 'wechat' && method === 'POST') {
    const body = await readBody(req);
    return ok(res, await svc.loginWithWechat({
      code: body.code,
      wechatClient,
      appConfig,
    }));
  }
  if (seg[1] === 'bind' && method === 'POST') {
    const body = await readBody(req);
    return ok(res, await svc.bindWechatMember({
      code: body.code,
      kind: body.kind,
      inviteCode: body.inviteCode,
      displayName: body.displayName,
      wechatClient,
      appConfig,
      attemptKeyPrefix: req.socket.remoteAddress || 'unknown',
    }));
  }
  if (seg[1] === 'change-role' && method === 'POST') {
    const member = requireIdentity(req);
    const body = await readBody(req);
    return ok(res, svc.changeMemberRole({
      member,
      kind: body.kind,
      inviteCode: body.inviteCode,
      appConfig,
      attemptKeyPrefix: req.socket.remoteAddress || 'unknown',
    }));
  }
  if (seg[1] === 'me' && method === 'GET') {
    const member = requireIdentity(req);
    return ok(res, {
      member: svc.serializeMember(member),
      expiresAt: req.session ? req.session.expires_at : null,
    });
  }
  if (seg[1] === 'logout' && method === 'POST') {
    const token = bearerToken(req);
    svc.logoutToken(token);
    return ok(res, { loggedOut: true });
  }
  fail(res, 404, '没有这个认证接口', 'NOT_FOUND');
}

async function readBody(req, maxBytes = 10 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const c of req) {
    total += c.length;
    if (total > maxBytes) {
      throw new AppError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大');
    }
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { _raw: raw }; }
}

async function handleMeals(method, seg, req, res, q) {
  const id = seg[1];

  if (id && seg[2] === 'log' && seg[3] === 'photos' && !seg[4] && method === 'GET') {
    return ok(res, { photos: svc.listMealLogPhotos(id) });
  }
  if (id && seg[2] === 'log' && seg[3] === 'photos' && !seg[4] && method === 'POST') {
    const body = await readBody(req, 3 * 1024 * 1024);
    return created(res, svc.addMealLogPhoto({
      meal_id: id,
      base64: body.data,
      mimeType: body.mimeType,
      member: req.member,
    }));
  }
  if (id && seg[2] === 'log' && seg[3] === 'photos' && seg[4] && method === 'DELETE') {
    return ok(res, svc.deleteMealLogPhoto({
      meal_id: id,
      photo_id: seg[4],
      member: req.member,
    }));
  }
  if (!id && method === 'GET') return ok(res, svc.listMeals());
  if (!id && method === 'POST') {
    const b = await readBody(req);
    guardChef(req);
    return created(res, svc.openMeal({ ...b, created_by: req.member.name }));
  }
  if (id && seg[2] === 'prep' && method === 'GET') return ok(res, svc.listPrep(id));
  if (id && seg[2] === 'log' && !seg[3] && method === 'GET') return ok(res, svc.getMealWithPrep(id).log);
  if (id && !seg[2] && method === 'GET') return ok(res, svc.getMealWithPrep(id));
  if (id && seg[2] === 'items' && method === 'POST') {
    const body = await readBody(req);
    return created(res, svc.addMealItem({
      ...body,
      meal_id: id,
      member: req.member,
      submitter: req.member.name,
    }));
  }
  if (id && seg[2] === 'prep' && seg[3] && method === 'PATCH') {
    const b = await readBody(req);
    guardChef(req);
    return ok(res, svc.togglePrep({ meal_id: id, entry_id: seg[3], prepared: !!b.prepared }));
  }
  if (id && seg[2] === 'prep' && !seg[3] && method === 'PATCH') {
    guardChef(req);
    return ok(res, svc.regeneratePrep(id));
  }
  if (id && seg[2] === 'items' && seg[3] && method === 'DELETE') {
    guardChef(req);
    return ok(res, svc.deleteMealItem({ meal_id: id, item_id: seg[3] }));
  }
  if (id && !seg[2] && method === 'DELETE') { guardChef(req); return ok(res, svc.deleteMeal(id)); }
  if (id && seg[2] === 'close' && method === 'PATCH') { guardChef(req); return ok(res, svc.closeMeal(id)); }
  if (id && seg[2] === 'log' && !seg[3] && method === 'POST') {
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
    guardChef(req);
    return created(res, svc.createRecipeFromSpecs(b));
  }
  if (id === 'x' && seg[2] === 'versions' && seg[3] && seg[4] === 'fork' && method === 'POST') {
    guardChef(req);
    return created(res, svc.forkRecipeVersion(seg[3]));
  }
  if (id === 'x' && seg[2] === 'versions' && seg[3] && (method === 'PUT' || method === 'PATCH')) {
    const b = await readBody(req);
    guardChef(req);
    return ok(res, svc.overwriteVersion({ versionId: seg[3], ...b }));
  }
  if (id && !seg[2] && method === 'DELETE') { guardChef(req); return ok(res, svc.deleteRecipe(id)); }
  if (id && !seg[2] && method === 'GET') return ok(res, svc.getRecipeDetail(id));
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
    guardChef(req);
    return created(res, svc.bulkAddInventory(b.text || '', req.member.name));
  }
  if (!id && method === 'POST') {
    const b = await readBody(req);
    guardChef(req);
    return created(res, svc.inventoryAdd({ ...b, operator: req.member.name }));
  }
  if (id && method === 'DELETE') { guardChef(req); return ok(res, svc.deleteInventory(id)); }
  if (id && method === 'PATCH') { guardChef(req);
    const b = await readBody(req);
    const op = b.op || q.get('op') || 'stocktake';
    if (op === 'subtract') return ok(res, svc.inventorySubtract({ ...b, id, operator: req.member.name }));
    if (op === 'stocktake') return ok(res, svc.inventoryStocktake({ ...b, id, operator: req.member.name }));
    return ok(res, svc.inventoryAdd({ ...b, operator: req.member.name }));
  }
  fail(res, 404, '没有这个库存接口');
}

async function handleMembers(method, seg, req, res, q) {
  if (method === 'GET') {
    const members = config.authMode === 'wechat'
      ? svc.listBoundMembers()
      : svc.listMembers();
    return ok(res, members.map(svc.serializeMember));
  }
  if (method === 'POST' && config.authMode === 'legacy') {
    const body = await readBody(req);
    const member = svc.identifyMember(body.name || '');
    return ok(res, svc.serializeMember(member));
  }
  if (method === 'POST') {
    throw new AppError(403, 'MEMBER_CREATION_DISABLED', '正式环境不允许创建新成员');
  }
  fail(res, 404, '没有这个成员接口', 'NOT_FOUND');
}
