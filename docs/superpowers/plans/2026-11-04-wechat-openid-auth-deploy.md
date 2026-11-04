# 微信 openid 登录绑定与正式上线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用微信 openid、双槽位邀请口令和服务端会话替换临时身份模型，并完成腾讯云 HTTPS 部署准备。

**Architecture:** 小程序用 `wx.login()` 获取一次性 code，后端调用微信 `jscode2session` 获得 openid；主厨和家人分别用独立口令绑定固定槽位。绑定成功后后端签发只保存哈希的随机会话 token，所有业务请求用 Bearer token 识别成员和主厨权限。正式环境使用 Node 24、Docker Compose、Caddy 和 SQLite。

**Tech Stack:** Node.js 24、node:sqlite、原生 HTTP、uni-app Vue 3、微信小程序 API、Docker Compose、Caddy、Ubuntu 24.04 LTS。

**Spec:** [2026-11-04-wechat-openid-auth-deploy-design.md](../specs/2026-11-04-wechat-openid-auth-deploy-design.md)

## Global Constraints

- Node.js 运行时使用 24.x；后端 `engines.node` 最低保持 `>=22.5.0`。
- 正式环境必须设置 `NODE_ENV=production` 和 `AUTH_MODE=wechat`。
- `AUTH_MODE=wechat` 时不得启用旧的家庭口令 `FAMILY_PASSCODE`。
- 正式环境禁止信任客户端传入的 `x-member-id`。
- `CHEF_BIND_CODE` 和 `FAMILY_INVITE_CODE` 至少 12 个字符。
- 显示名去除首尾空格后长度为 1 到 20 个字符。
- 会话 token 使用 32 字节随机值，默认有效期 30 天，数据库只保存 SHA-256 哈希。
- `WX_SECRET`、`session_key`、token 明文和邀请码不得写入小程序包、日志或 Git。
- 两个成员槽位都绑定后，未知 openid 不得创建新成员。
- 点菜的 `submitter`、开饭的 `created_by`、库存操作的 `operator` 只能取自服务端会话。
- 成员接口不得返回 `openid`、`bound_at` 或会话字段。
- 微信请求域名必须是 HTTPS，并完成 ICP 备案，TLS 必须支持 1.2 及以上。
- 腾讯云系统镜像使用 Ubuntu Server 24.04 LTS 64 位；不可用时使用 22.04 LTS。
- 应用容器镜像使用 `node:24-bookworm-slim`。
- 生产应用端口 8080 不直接暴露公网，80/443 由 Caddy 接收。
- SQLite 备份必须使用一致性快照，不能在 WAL 活跃时直接复制主数据库文件。
- 每个任务完成后单独提交，不把无关的现有工作区改动放入提交。

## 文件结构

### 后端新增

- `backend/src/errors.js`：结构化 HTTP 错误。
- `backend/src/auth/wechat.js`：微信 `jscode2session` 客户端。
- `backend/src/auth/passcode.js`：绑定口令的安全比较。
- `backend/src/auth/session.js`：token、哈希和过期时间工具。
- `backend/src/auth/rateLimit.js`：绑定失败限流。
- `backend/src/auth/request.js`：Bearer token 提取和鉴权辅助。
- `backend/tests/config.test.js`：配置校验测试。
- `backend/tests/authRepo.test.js`：迁移、绑定和会话仓储测试。
- `backend/tests/authService.test.js`：微信登录、绑定、会话服务测试。
- `backend/tests/authHttp.test.js`：HTTP 接口和权限测试。
- `backend/tests/identityAttribution.test.js`：提交人和多人点菜审计测试。
- `backend/scripts/backup.js`：SQLite 一致性备份脚本。

### 后端修改

- `backend/src/config.js`：增加微信和认证配置及启动校验。
- `backend/src/util.js`：错误响应支持错误码，CORS 允许 Authorization。
- `backend/src/server.js`：启动校验、健康检查和 CORS。
- `backend/src/schema.sql`：增加会话表和点菜提交审计表。
- `backend/src/db.js`：执行幂等迁移。
- `backend/src/repo.js`：成员绑定、会话、提交审计数据访问。
- `backend/src/services.js`：微信登录、绑定、token 鉴权和身份归属。
- `backend/src/routes.js`：认证接口、业务接口保护和主厨权限。

### 小程序新增

- `miniprogram/src/utils/http.js`：底层请求和 API 错误。
- `miniprogram/src/utils/token.js`：token 与成员本地存储。
- `miniprogram/src/utils/auth.js`：微信登录、绑定和自动登录。
- `miniprogram/src/pages/bind/bind.vue`：主厨或家人首次绑定页。
- `miniprogram/tests/auth.test.js`：登录状态和 401 重试测试。

### 小程序修改

- `miniprogram/src/utils/index.js`：统一请求携带 token 并自动重试。
- `miniprogram/src/pages.json`：注册绑定页。
- `miniprogram/src/pages/today/today.vue`：移除本地身份选择，启动时自动登录。
- `miniprogram/src/manifest.json`：正式 AppID 和合法域名校验。

### 部署新增

- `backend/Dockerfile`：Node 24 运行镜像。
- `docker-compose.yml`：应用和 Caddy 编排。
- `deploy/Caddyfile`：HTTPS 反向代理。
- `deploy/.env.example`：生产环境变量模板。
- `deploy/README.md`：腾讯云部署与回滚手册。
- `docs/08-wechat-openid-release-checklist.md`：上线验收清单。

---

## Task 1: 认证配置、结构化错误和 CORS

**Files:**
- Create: `backend/src/errors.js`
- Modify: `backend/src/config.js`
- Modify: `backend/src/util.js`
- Modify: `backend/src/server.js`
- Test: `backend/tests/config.test.js`

**Interfaces:**
- Produces: `AppError(status, code, message)`，属性为 `status`、`code`、`message`。
- Produces: `validateAuthConfig(value = config): void`，配置不合法时抛出 `Error`。
- Produces: `config.authMode`、`config.nodeEnv`、`config.wxAppId`、`config.wxSecret`、`config.chefBindCode`、`config.familyInviteCode`、`config.sessionTtlDays`。
- Produces: `fail(res, status, message, code = 'BAD_REQUEST')` 的响应包含 `data.code`。

- [ ] **Step 1: 写配置和错误测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAuthConfig } from '../src/config.js';
import { AppError } from '../src/errors.js';

const valid = {
  nodeEnv: 'production',
  authMode: 'wechat',
  wxAppId: 'wx-app-id',
  wxSecret: 'wx-secret',
  chefBindCode: 'chef-code-12345',
  familyInviteCode: 'family-code-123',
  sessionTtlDays: 30,
};

test('正式环境必须启用微信登录', () => {
  assert.throws(
    () => validateAuthConfig({ ...valid, authMode: 'legacy' }),
    /生产环境必须使用 AUTH_MODE=wechat/,
  );
});

test('微信模式缺少任意必要配置时拒绝启动', () => {
  assert.throws(
    () => validateAuthConfig({ ...valid, wxSecret: '' }),
    /WX_SECRET/,
  );
});

test('绑定口令至少 12 个字符', () => {
  assert.throws(
    () => validateAuthConfig({ ...valid, chefBindCode: 'short' }),
    /CHEF_BIND_CODE/,
  );
});

test('微信模式不得同时启用旧家庭口令', () => {
  assert.throws(
    () => validateAuthConfig({ ...valid, passcode: 'legacy-passcode' }),
    /FAMILY_PASSCODE/,
  );
});

test('有效微信配置通过校验', () => {
  assert.doesNotThrow(() => validateAuthConfig(valid));
});

test('AppError 保留 HTTP 状态和错误码', () => {
  const error = new AppError(403, 'CHEF_ONLY', '只有主厨才能操作');
  assert.equal(error.status, 403);
  assert.equal(error.code, 'CHEF_ONLY');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/config.test.js`

Expected: FAIL，因为 `errors.js` 不存在，且 `config.js` 没有 `validateAuthConfig`。

- [ ] **Step 3: 实现配置和错误类型**

`backend/src/errors.js`：

```js
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}
```

`backend/src/config.js`：

```js
const env = process.env;

export const config = {
  port: Number(env.PORT || 8080),
  host: env.HOST || '0.0.0.0',
  dataDir: env.DATA_DIR || '',
  passcode: env.FAMILY_PASSCODE || '',
  nodeEnv: env.NODE_ENV || 'development',
  authMode: env.AUTH_MODE || 'legacy',
  wxAppId: env.WX_APPID || '',
  wxSecret: env.WX_SECRET || '',
  chefBindCode: env.CHEF_BIND_CODE || '',
  familyInviteCode: env.FAMILY_INVITE_CODE || '',
  sessionTtlDays: Number(env.SESSION_TTL_DAYS || 30),
};

export function validateAuthConfig(value = config) {
  if (value.nodeEnv === 'production' && value.authMode !== 'wechat') {
    throw new Error('生产环境必须使用 AUTH_MODE=wechat');
  }
  if (value.authMode !== 'wechat') return;
  if (value.passcode) {
    throw new Error('AUTH_MODE=wechat 时请移除 FAMILY_PASSCODE');
  }

  const required = [
    ['WX_APPID', value.wxAppId],
    ['WX_SECRET', value.wxSecret],
    ['CHEF_BIND_CODE', value.chefBindCode],
    ['FAMILY_INVITE_CODE', value.familyInviteCode],
  ];
  const missing = required.filter(([, item]) => !item).map(([key]) => key);
  if (missing.length) {
    throw new Error(`微信登录缺少配置：${missing.join(', ')}`);
  }
  if (value.chefBindCode.length < 12) {
    throw new Error('CHEF_BIND_CODE 至少需要 12 个字符');
  }
  if (value.familyInviteCode.length < 12) {
    throw new Error('FAMILY_INVITE_CODE 至少需要 12 个字符');
  }
  if (!Number.isInteger(value.sessionTtlDays) || value.sessionTtlDays <= 0) {
    throw new Error('SESSION_TTL_DAYS 必须是正整数');
  }
}
```

- [ ] **Step 4: 改造错误响应和 CORS**

`backend/src/util.js` 的 `json` 响应头改为：

```js
'Access-Control-Allow-Headers': 'Content-Type, Authorization',
```

`backend/src/util.js` 的 `fail` 改为：

```js
export function fail(res, status, message, code = 'BAD_REQUEST') {
  json(res, status, { error: message, code });
}
```

`backend/src/server.js` 的 OPTIONS 响应增加同样的 `Access-Control-Allow-Headers`，并在 `openDb()` 前执行：

```js
import { config, validateAuthConfig } from './config.js';

validateAuthConfig(config);
```

- [ ] **Step 5: 运行测试和语法检查**

Run: `node --test tests/config.test.js`

Expected: PASS。

Run: `node --check src/server.js`

Expected: 退出码 0。

- [ ] **Step 6: 提交**

```bash
git add backend/src/errors.js backend/src/config.js backend/src/util.js backend/src/server.js backend/tests/config.test.js
git commit -m "feat: add WeChat auth configuration and structured errors"
```

---

## Task 2: 数据库迁移、成员绑定和会话仓储

**Files:**
- Modify: `backend/src/schema.sql`
- Modify: `backend/src/db.js`
- Modify: `backend/src/repo.js`
- Test: `backend/tests/authRepo.test.js`

**Interfaces:**

Produces：

- `repo.getMemberByOpenid(openid): Member | undefined`
- `repo.bindMemberSlot({ openid, memberId, name, boundAt }): Member`
- `repo.createAuthSession({ tokenHash, memberId, createdAt, expiresAt }): void`
- `repo.getAuthSessionByHash(tokenHash): AuthSession | undefined`
- `repo.touchAuthSession(tokenHash, lastSeenAt): void`
- `repo.deleteAuthSession(tokenHash): number`
- `repo.deleteExpiredSessions(nowIso): number`
- `repo.upsertMealItemWithSubmission({ mealId, versionId, memberId, memberName, quantity, note, submittedAt }): string`
- `repo.upsertMealSubmission({ mealId, versionId, memberId, memberName, quantity, note, submittedAt }): string`
- `repo.listMealSubmissions(mealId): Submission[]`

- [ ] **Step 1: 写迁移和仓储失败测试**

```js
import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_DIR = ':memory:';
const repo = await import('../src/repo.js');
const dbm = await import('../src/db.js');

before(() => { dbm.openDb(); });
afterEach(() => { dbm.closeDbForTest(); });

test('迁移创建绑定字段、会话表和提交审计表', () => {
  const memberCols = repo.db().prepare('PRAGMA table_info(family_member)').all();
  const tables = repo.db()
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((row) => row.name);
  assert.ok(memberCols.some((col) => col.name === 'bound_at'));
  assert.ok(tables.includes('auth_session'));
  assert.ok(tables.includes('meal_item_submission'));
});

test('一个成员槽位只能绑定一个 openid', () => {
  const member = repo.bindMemberSlot({
    openid: 'openid-first',
    memberId: 'member-chef',
    name: '爸爸',
    boundAt: '2026-11-04T00:00:00.000Z',
  });
  assert.equal(member.name, '爸爸');
  assert.throws(
    () => repo.bindMemberSlot({
      openid: 'openid-second',
      memberId: 'member-chef',
      name: '别人',
      boundAt: '2026-11-04T00:01:00.000Z',
    }),
    /已经绑定/,
  );
});

test('会话可以创建、查询和删除', () => {
  repo.createAuthSession({
    tokenHash: 'hash-1',
    memberId: 'member-chef',
    createdAt: '2026-11-04T00:00:00.000Z',
    expiresAt: '2026-12-04T00:00:00.000Z',
  });
  assert.equal(repo.getAuthSessionByHash('hash-1').member_id, 'member-chef');
  assert.equal(repo.deleteAuthSession('hash-1'), 1);
  assert.equal(repo.getAuthSessionByHash('hash-1'), undefined);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/authRepo.test.js`

Expected: FAIL，因为 `bindMemberSlot`、`createAuthSession` 和迁移表尚不存在。

- [ ] **Step 3: 增加 schema 和幂等迁移**

在 `backend/src/schema.sql` 增加：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_family_member_openid
ON family_member(openid)
WHERE openid IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_session (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES family_member(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_session_member
ON auth_session(member_id);

CREATE INDEX IF NOT EXISTS idx_auth_session_expires
ON auth_session(expires_at);

CREATE TABLE IF NOT EXISTS meal_item_submission (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL REFERENCES meal(id) ON DELETE CASCADE,
  recipe_version_id TEXT NOT NULL REFERENCES recipe_version(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES family_member(id) ON DELETE CASCADE,
  member_name_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL,
  UNIQUE(meal_id, recipe_version_id, member_id)
);
```

`backend/src/db.js` 增加幂等迁移，在 `database.exec(schema)` 后调用：

```js
function migrate(database) {
  const columns = database.prepare('PRAGMA table_info(family_member)').all();
  if (!columns.some((column) => column.name === 'bound_at')) {
    database.exec('ALTER TABLE family_member ADD COLUMN bound_at TEXT;');
  }
}

migrate(database);
```

- [ ] **Step 4: 实现仓储函数**

在 `backend/src/repo.js` 顶部导入：

```js
import { AppError } from './errors.js';
```

增加以下函数：

```js
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
```

增加点菜提交审计仓储：

```js
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
```

增加原子写入函数：

```js
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
```

- [ ] **Step 5: 运行仓储和现有服务测试**

Run: `node --test tests/authRepo.test.js`

Expected: PASS。

Run: `node --test tests/services.test.js`

Expected: 现有测试继续通过。

- [ ] **Step 6: 提交**

```bash
git add backend/src/schema.sql backend/src/db.js backend/src/repo.js backend/tests/authRepo.test.js
git commit -m "feat: add WeChat member binding and session storage"
```

---

## Task 3: 微信客户端、口令校验和会话服务

**Files:**
- Create: `backend/src/auth/wechat.js`
- Create: `backend/src/auth/passcode.js`
- Create: `backend/src/auth/session.js`
- Create: `backend/src/auth/rateLimit.js`
- Modify: `backend/src/services.js`
- Test: `backend/tests/authService.test.js`

**Interfaces:**

Produces：

- `createWechatClient({ appId, appSecret, fetchImpl = fetch, timeoutMs = 5000 }).exchangeCode(code): Promise<{ openid }>`
- `verifyBindCode(kind, provided, appConfig): void`
- `createAttemptLimiter({ limit = 5, windowMs = 15 * 60 * 1000, now = Date.now }): { assertAllowed, recordFailure, clear }`
- `newSessionToken(): string`
- `hashSessionToken(token): string`
- `sessionExpiresAt(days, now = Date.now()): string`
- `loginWithWechat({ code, wechatClient, appConfig }): Promise<{ status: 'bound' | 'needs_binding', token?, expiresAt?, member? }>`
- `bindWechatMember({ code, kind, inviteCode, displayName, wechatClient, appConfig }): Promise<{ status: 'bound', token, expiresAt, member }>`
- `authenticateToken(token): { member, session }`
- `logoutToken(token): void`
- `serializeMember(member): { id, name, role, color }`

- [ ] **Step 1: 写认证服务失败测试**

```js
import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_DIR = ':memory:';
const svc = await import('../src/services.js');
const repo = await import('../src/repo.js');
const dbm = await import('../src/db.js');
const { createWechatClient } = await import('../src/auth/wechat.js');
const { hashSessionToken } = await import('../src/auth/session.js');
const { AppError } = await import('../src/errors.js');

before(() => { dbm.openDb(); });
afterEach(() => { dbm.closeDbForTest(); });

const appConfig = {
  chefBindCode: 'chef-code-12345',
  familyInviteCode: 'family-code-123',
  sessionTtlDays: 30,
};

function fakeWechat(openid = 'openid-chef') {
  return {
    async exchangeCode(code) {
      if (code === 'bad-code') {
        throw new AppError(401, 'INVALID_LOGIN_CODE', '微信登录凭证无效');
      }
      return { openid };
    },
  };
}

test('未绑定 openid 返回 needs_binding', async () => {
  const result = await svc.loginWithWechat({
    code: 'good-code',
    wechatClient: fakeWechat('openid-new'),
    appConfig,
  });
  assert.deepEqual(result, { status: 'needs_binding' });
});

test('正确主厨口令绑定主厨并签发会话', async () => {
  const result = await svc.bindWechatMember({
    code: 'good-code',
    kind: 'chef',
    inviteCode: 'chef-code-12345',
    displayName: '爸爸',
    wechatClient: fakeWechat('openid-chef'),
    appConfig,
  });
  assert.equal(result.status, 'bound');
  assert.equal(result.member.role, 'chef');
  assert.equal(result.member.name, '爸爸');
  assert.ok(result.token);
  assert.equal(repo.getMemberByOpenid('openid-chef').id, 'member-chef');
});

test('错误家人邀请码被拒绝', async () => {
  await assert.rejects(
    () => svc.bindWechatMember({
      code: 'good-code',
      kind: 'family',
      inviteCode: 'wrong-code',
      displayName: '妈妈',
      wechatClient: fakeWechat('openid-family'),
      appConfig,
    }),
    (error) => error.code === 'INVALID_INVITE_CODE',
  );
});

test('token 可鉴权，注销后立即失效', async () => {
  const result = await svc.bindWechatMember({
    code: 'good-code',
    kind: 'family',
    inviteCode: 'family-code-123',
    displayName: '妈妈',
    wechatClient: fakeWechat('openid-family'),
    appConfig,
  });
  const auth = svc.authenticateToken(result.token);
  assert.equal(auth.member.id, 'member-family');
  svc.logoutToken(result.token);
  assert.throws(() => svc.authenticateToken(result.token));
});

test('过期 token 被拒绝', async () => {
  const result = await svc.bindWechatMember({
    code: 'good-code',
    kind: 'family',
    inviteCode: 'family-code-123',
    displayName: '妈妈',
    wechatClient: fakeWechat('openid-expired'),
    appConfig,
  });
  repo.db().prepare('UPDATE auth_session SET expires_at = ? WHERE token_hash = ?')
    .run('2020-01-01T00:00:00.000Z', hashSessionToken(result.token));
  assert.throws(
    () => svc.authenticateToken(result.token),
    (error) => error.code === 'UNAUTHORIZED',
  );
});

test('微信客户端解析 openid 且不返回 session_key', async () => {
  const client = createWechatClient({
    appId: 'wx-app',
    appSecret: 'wx-secret',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ openid: 'openid-from-wechat', session_key: 'must-not-leak' }),
    }),
  });
  assert.deepEqual(await client.exchangeCode('code-1'), { openid: 'openid-from-wechat' });
});

test('绑定失败达到 5 次后触发限流，窗口结束后恢复', () => {
  const { createAttemptLimiter } = await import('../src/auth/rateLimit.js');
  let now = 0;
  const limiter = createAttemptLimiter({
    limit: 5,
    windowMs: 1000,
    now: () => now,
  });
  for (let i = 0; i < 5; i += 1) {
    limiter.assertAllowed('ip:openid:family');
    limiter.recordFailure('ip:openid:family');
  }
  assert.throws(
    () => limiter.assertAllowed('ip:openid:family'),
    (error) => error.code === 'TOO_MANY_ATTEMPTS',
  );
  now = 1001;
  assert.doesNotThrow(() => limiter.assertAllowed('ip:openid:family'));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/authService.test.js`

Expected: FAIL，因为认证模块和服务函数尚不存在。

- [ ] **Step 3: 实现微信客户端、口令和会话工具**

`backend/src/auth/wechat.js`：

```js
import { AppError } from '../errors.js';

export function createWechatClient({
  appId,
  appSecret,
  fetchImpl = fetch,
  timeoutMs = 5000,
}) {
  return {
    async exchangeCode(code) {
      if (!code) throw new AppError(401, 'INVALID_LOGIN_CODE', '微信登录凭证无效');
      const params = new URLSearchParams({
        appid: appId,
        secret: appSecret,
        js_code: code,
        grant_type: 'authorization_code',
      });
      let response;
      try {
        response = await fetchImpl(
          `https://api.weixin.qq.com/sns/jscode2session?${params}`,
          { signal: AbortSignal.timeout(timeoutMs) },
        );
      } catch {
        throw new AppError(503, 'WECHAT_LOGIN_FAILED', '微信登录服务暂时不可用');
      }
      let body;
      try {
        body = await response.json();
      } catch {
        throw new AppError(502, 'WECHAT_LOGIN_FAILED', '微信登录响应无法解析');
      }
      if (!response.ok || body.errcode || !body.openid) {
        throw new AppError(401, 'INVALID_LOGIN_CODE', '微信登录凭证无效');
      }
      return { openid: body.openid };
    },
  };
}
```

`backend/src/auth/passcode.js`：

```js
import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from '../errors.js';

function digest(value) {
  return createHash('sha256').update(String(value || '')).digest();
}

export function verifyBindCode(kind, provided, appConfig) {
  if (kind !== 'chef' && kind !== 'family') {
    throw new AppError(400, 'INVALID_BIND_KIND', '绑定类型无效');
  }
  const expected = kind === 'chef'
    ? appConfig.chefBindCode
    : appConfig.familyInviteCode;
  if (!expected || !timingSafeEqual(digest(provided), digest(expected))) {
    throw new AppError(403, 'INVALID_INVITE_CODE', '绑定口令不正确');
  }
}
```

`backend/src/auth/session.js`：

```js
import { createHash, randomBytes } from 'node:crypto';

export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionExpiresAt(days, now = Date.now()) {
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}
```

`backend/src/auth/rateLimit.js`：

```js
import { AppError } from '../errors.js';

export function createAttemptLimiter({
  limit = 5,
  windowMs = 15 * 60 * 1000,
  now = Date.now,
} = {}) {
  const buckets = new Map();
  function current(key) {
    const entry = buckets.get(key);
    if (!entry || entry.resetAt <= now()) {
      const fresh = { count: 0, resetAt: now() + windowMs };
      buckets.set(key, fresh);
      return fresh;
    }
    return entry;
  }
  return {
    assertAllowed(key) {
      if (current(key).count >= limit) {
        throw new AppError(429, 'TOO_MANY_ATTEMPTS', '绑定失败次数过多，请稍后再试');
      }
    },
    recordFailure(key) {
      current(key).count += 1;
    },
    clear(key) {
      buckets.delete(key);
    },
  };
}
```

- [ ] **Step 4: 实现服务层绑定和会话**

在 `backend/src/services.js` 增加导入：

```js
import { AppError } from './errors.js';
import { verifyBindCode } from './auth/passcode.js';
import { hashSessionToken, newSessionToken, sessionExpiresAt } from './auth/session.js';
import { createAttemptLimiter } from './auth/rateLimit.js';
```

增加以下函数：

```js
const MEMBER_SLOTS = { chef: 'member-chef', family: 'member-family' };
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
  const member = repo.bindMemberSlot({
    openid,
    memberId: MEMBER_SLOTS[kind],
    name: normalizeDisplayName(displayName),
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
```

修改 `guardChef`，兼容现有按成员 ID 调用的测试：

```js
export function guardChef(memberOrId, action = '该操作') {
  const member = typeof memberOrId === 'string'
    ? repo.getMemberById(memberOrId)
    : memberOrId;
  if (!member || member.role !== 'chef') {
    throw new AppError(403, 'CHEF_ONLY', `${action}只有主厨才能做`);
  }
}
```

- [ ] **Step 5: 运行认证服务和现有测试**

Run: `node --test tests/authService.test.js`

Expected: PASS。

Run: `node --test tests/services.test.js`

Expected: PASS，包括原有主厨权限测试。

- [ ] **Step 6: 提交**

```bash
git add backend/src/auth backend/src/services.js backend/tests/authService.test.js
git commit -m "feat: implement WeChat login binding and session authentication"
```

---

## Task 4: HTTP 认证接口和业务接口保护

**Files:**
- Create: `backend/src/auth/request.js`
- Modify: `backend/src/routes.js`
- Modify: `backend/src/server.js`
- Test: `backend/tests/authHttp.test.js`

**Interfaces:**

Produces：

- `bearerToken(req): string`
- `requireIdentity(req): Member`
- `POST /auth/wechat`
- `POST /auth/bind`
- `GET /auth/me`
- `POST /auth/logout`
- `GET /health`

- [ ] **Step 1: 写 HTTP 契约失败测试**

```js
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_DIR = ':memory:';
process.env.AUTH_MODE = 'wechat';
process.env.WX_APPID = 'wx-app';
process.env.WX_SECRET = 'wx-secret';
process.env.CHEF_BIND_CODE = 'chef-code-12345';
process.env.FAMILY_INVITE_CODE = 'family-code-123';
process.env.SESSION_TTL_DAYS = '30';

const { handle } = await import('../src/routes.js');
const dbm = await import('../src/db.js');
const { AppError } = await import('../src/errors.js');

let server;
let baseUrl;
let nextOpenid = 'openid-chef';

const fakeWechat = {
  async exchangeCode(code) {
    if (code === 'bad-code') {
      throw new AppError(401, 'INVALID_LOGIN_CODE', '微信登录凭证无效');
    }
    return { openid: nextOpenid };
  },
};

before(async () => {
  dbm.openDb();
  server = createServer((req, res) => {
    handle(req, res, new URL(req.url, 'http://localhost'), { wechatClient: fakeWechat });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => {
  nextOpenid = 'openid-chef';
});

after(async () => {
  server.close();
  await once(server, 'close');
  dbm.closeDbForTest();
});

test('未登录访问业务接口返回 401 和稳定错误码', async () => {
  const response = await fetch(`${baseUrl}/meals`);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).data.code, 'UNAUTHORIZED');
});

test('主厨绑定后可以访问业务接口，成员响应不泄露 openid', async () => {
  const login = await fetch(`${baseUrl}/auth/wechat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'good-code' }),
  });
  assert.equal((await login.json()).data.status, 'needs_binding');

  const bind = await fetch(`${baseUrl}/auth/bind`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'good-code',
      kind: 'chef',
      inviteCode: 'chef-code-12345',
      displayName: '爸爸',
    }),
  });
  const bindBody = await bind.json();
  assert.equal(bindBody.data.member.role, 'chef');

  const members = await fetch(`${baseUrl}/members`, {
    headers: { Authorization: `Bearer ${bindBody.data.token}` },
  });
  assert.equal(members.status, 200);
  assert.equal((await members.text()).includes('openid'), false);

  const meal = await fetch(`${baseUrl}/meals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bindBody.data.token}`,
    },
    body: JSON.stringify({ title: '今晚', created_by: '伪造的人' }),
  });
  assert.equal((await meal.json()).data.created_by, '爸爸');
});

test('家人不能创建饭局', async () => {
  nextOpenid = 'openid-family';
  const bind = await fetch(`${baseUrl}/auth/bind`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'good-code',
      kind: 'family',
      inviteCode: 'family-code-123',
      displayName: '妈妈',
    }),
  });
  const family = await bind.json();
  const denied = await fetch(`${baseUrl}/meals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${family.data.token}`,
    },
    body: JSON.stringify({ title: '今晚' }),
  });
  assert.equal(denied.status, 403);
});

test('健康检查不需要认证', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.status, 'ok');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/authHttp.test.js`

Expected: FAIL，因为认证接口、健康检查和鉴权逻辑尚不存在。

- [ ] **Step 3: 实现 Bearer token 提取和路由鉴权**

`backend/src/auth/request.js`：

```js
import { AppError } from '../errors.js';

export function bearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', '请先登录');
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) throw new AppError(401, 'UNAUTHORIZED', '请先登录');
  return token;
}
```

在 `backend/src/routes.js` 增加导入：

```js
import { config } from './config.js';
import { AppError } from './errors.js';
import { bearerToken } from './auth/request.js';
import { createWechatClient } from './auth/wechat.js';
```

增加：

```js
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
```

在 `handle` 的 `try` 开头增加健康检查和认证路由，业务路径先调用 `requireIdentity(req)`：

```js
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
  return ok(res, {
    days: svc.calendarMonth(
      Number(q.get('year') || new Date().getFullYear()),
      Number(q.get('month') || new Date().getMonth() + 1),
    ),
  });
}
```

修改 `handle` 签名和错误捕获：

```js
export async function handle(req, res, url, deps = {}) {
  const method = req.method;
  const path = url.pathname;
  const seg = path.split('/').filter(Boolean);
  const q = url.searchParams;
  try {
    // ...
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 400;
    fail(res, status, error.message || '请求出错', error.code || 'BAD_REQUEST');
  }
}
```

增加认证接口：

```js
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
```

- [ ] **Step 4: 保护成员读取并移除正式环境的昵称创建**

将 `handleMembers` 改为：

```js
async function handleMembers(method, seg, req, res, q) {
  if (method === 'GET') {
    return ok(res, svc.listMembers().map(svc.serializeMember));
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
```

在 `services.js` 增加：

```js
export function healthCheck() {
  repo.db().prepare('SELECT 1').get();
}
```

在 `server.js` 让 `/health` 进入路由：

```js
if (pathname === '/health') {
  handle(req, res, url);
  return;
}
```

- [ ] **Step 5: 运行 HTTP 契约测试**

Run: `node --test tests/authHttp.test.js`

Expected: PASS。

Run: `node --test tests/config.test.js tests/authService.test.js`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add backend/src/auth/request.js backend/src/routes.js backend/src/server.js backend/tests/authHttp.test.js
git commit -m "feat: add authenticated HTTP routes and chef guards"
```

---

## Task 5: 服务端身份归属和点菜提交审计

**Files:**
- Modify: `backend/src/services.js`
- Modify: `backend/src/repo.js`
- Modify: `backend/src/routes.js`
- Test: `backend/tests/identityAttribution.test.js`

**Interfaces:**

Produces：

- `addMealItem({ meal_id, recipe_version_id, member?, submitter?, quantity?, note? })`
- `getMealDetail(id)` 返回 `items` 和 `submissions`
- `meal.created_by = req.member.name`
- `meal_item.submitter = req.member.name`
- `meal_item_submission` 保留每个成员的提交记录

- [ ] **Step 1: 写多人点菜和身份归属失败测试**

```js
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/identityAttribution.test.js`

Expected: FAIL，因为 `addMealItem` 还没有 `member` 参数和提交审计写入。

- [ ] **Step 3: 写入提交审计并覆盖客户端字段**

修改 `getMealDetail`：

```js
function getMealDetail(id) {
  const meal = repo.getMeal(id);
  if (!meal) return null;
  return {
    ...meal,
    items: repo.listMealItems(id),
    submissions: repo.listMealSubmissions(id),
  };
}
```

替换 `addMealItem`：

```js
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
```

修改 `routes.js` 点菜分支：

```js
if (id && seg[2] === 'items' && method === 'POST') {
  const body = await readBody(req);
  return created(res, svc.addMealItem({
    ...body,
    meal_id: id,
    member: req.member,
    submitter: req.member.name,
  }));
}
```

开饭、库存批量、库存新增和库存 PATCH 都使用 `req.member.name` 覆盖客户端字段：

```js
return created(res, svc.openMeal({ ...body, created_by: req.member.name }));
return created(res, svc.bulkAddInventory(body.text || '', req.member.name));
return created(res, svc.inventoryAdd({ ...body, operator: req.member.name }));
```

- [ ] **Step 4: 运行身份归属测试**

Run: `node --test tests/identityAttribution.test.js`

Expected: PASS。

Run: `node --test tests/services.test.js`

Expected: PASS。

- [ ] **Step 5: 运行全部后端测试**

Run: `npm test`

Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add backend/src/services.js backend/src/repo.js backend/src/routes.js backend/tests/identityAttribution.test.js
git commit -m "feat: attribute meal submissions to authenticated members"
```

---

## Task 6: 小程序底层请求、token 存储和自动登录

**Files:**
- Create: `miniprogram/src/utils/http.js`
- Create: `miniprogram/src/utils/token.js`
- Create: `miniprogram/src/utils/auth.js`
- Modify: `miniprogram/src/utils/index.js`
- Test: `miniprogram/tests/auth.test.js`

**Interfaces:**

Produces：

- `rawRequest(path, method = 'GET', body, options = {}): Promise<{ data, statusCode }>`
- `getToken(): string`
- `setAuth(token, member): void`
- `clearAuth(): void`
- `getStoredMember(): Member | null`
- `getMember(): Member | null`
- `ensureLogin(force = false): Promise<Member>`
- `loginWithWechat(): Promise<{ status, token?, member? }>`
- `bindWechatMember({ kind, inviteCode, displayName }): Promise<Member>`
- `request(path, method = 'GET', body, options = {}): Promise<unknown>`

- [ ] **Step 1: 写小程序认证失败测试**

```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
let requestResponses = [];
let loginCalls = 0;
let reLaunchCalls = 0;

globalThis.uni = {
  getSystemInfoSync: () => ({ platform: 'devtools' }),
  getStorageSync: (key) => storage.get(key) || '',
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: (key) => storage.delete(key),
  login: ({ success }) => {
    loginCalls += 1;
    success({ code: `code-${loginCalls}` });
  },
  reLaunch: () => { reLaunchCalls += 1; },
  request: ({ success }) => {
    success(requestResponses.shift());
  },
  showToast: () => {},
};

beforeEach(() => {
  storage.clear();
  requestResponses = [];
  loginCalls = 0;
  reLaunchCalls = 0;
});

const auth = await import('../src/utils/auth.js');

test('已绑定微信登录保存 token 和成员', async () => {
  requestResponses.push({
    statusCode: 200,
    data: {
      ok: true,
      data: {
        status: 'bound',
        token: 'token-1',
        member: {
          id: 'member-chef',
          name: '爸爸',
          role: 'chef',
          color: '#D96A3B',
        },
      },
    },
  });
  const result = await auth.loginWithWechat();
  assert.equal(result.status, 'bound');
  assert.equal(auth.getTokenValue(), 'token-1');
  assert.equal(auth.getMember().role, 'chef');
});

test('未绑定微信登录跳转绑定页', async () => {
  requestResponses.push({
    statusCode: 200,
    data: { ok: true, data: { status: 'needs_binding' } },
  });
  await assert.rejects(
    () => auth.ensureLogin(true),
    (error) => error.code === 'BIND_REQUIRED',
  );
  assert.equal(reLaunchCalls, 1);
});

test('已有 token 时 ensureLogin 不重复请求微信登录', async () => {
  auth.setAuthForTest('token-existing', {
    id: 'member-family',
    name: '妈妈',
    role: 'member',
    color: '#5B8C5A',
  });
  const member = await auth.ensureLogin();
  assert.equal(member.id, 'member-family');
  assert.equal(loginCalls, 0);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`

Expected: FAIL，因为 `utils/auth.js` 尚未创建。

- [ ] **Step 3: 实现底层请求和 token 存储**

`miniprogram/src/utils/http.js`：

```js
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function getBaseUrlForPlatform() {
  try {
    return uni.getSystemInfoSync().platform === 'devtools'
      ? 'http://localhost:8080'
      : 'http://192.168.5.2:8080';
  } catch {
    return 'http://192.168.5.2:8080';
  }
}

export const BASE_URL = getBaseUrlForPlatform();

export function rawRequest(path, method = 'GET', body, options = {}) {
  const url = BASE_URL + (path.startsWith('/api') ? path : `/api${path}`);
  const header = { 'Content-Type': 'application/json' };
  if (options.token) header.Authorization = `Bearer ${options.token}`;
  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method,
      data: body,
      header,
      success(res) {
        const payload = res.data;
        if (res.statusCode >= 200 && res.statusCode < 300 && payload && payload.ok) {
          resolve({ data: payload.data, statusCode: res.statusCode });
          return;
        }
        reject(new ApiError(
          res.statusCode,
          payload && payload.data && payload.data.code,
          (payload && payload.data && payload.data.error) || `请求失败(${res.statusCode})`,
        ));
      },
      fail(error) {
        reject(new ApiError(0, 'NETWORK_ERROR', error.errMsg || '网络错误'));
      },
    });
  });
}
```

`miniprogram/src/utils/token.js`：

```js
const TOKEN_KEY = 'family-meal-token';
const MEMBER_KEY = 'family-meal-auth-member';

export function getToken() {
  return uni.getStorageSync(TOKEN_KEY) || '';
}

export function setAuth(token, member) {
  uni.setStorageSync(TOKEN_KEY, token);
  uni.setStorageSync(MEMBER_KEY, JSON.stringify(member));
}

export function clearAuth() {
  uni.removeStorageSync(TOKEN_KEY);
  uni.removeStorageSync(MEMBER_KEY);
}

export function getStoredMember() {
  const raw = uni.getStorageSync(MEMBER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    clearAuth();
    return null;
  }
}
```

- [ ] **Step 4: 实现微信登录、绑定和 401 重试**

`miniprogram/src/utils/auth.js`：

```js
import { rawRequest, ApiError } from './http.js';
import { getToken, setAuth, clearAuth, getStoredMember } from './token.js';

export function getMember() {
  return getStoredMember();
}

export function getTokenValue() {
  return getToken();
}

export function setAuthForTest(token, member) {
  setAuth(token, member);
}

export function wxLogin() {
  return new Promise((resolve, reject) => {
    uni.login({
      success(result) {
        if (result.code) resolve(result.code);
        else reject(new ApiError(401, 'INVALID_LOGIN_CODE', '无法获取微信登录凭证'));
      },
      fail(error) {
        reject(new ApiError(0, 'WECHAT_LOGIN_FAILED', error.errMsg || '微信登录失败'));
      },
    });
  });
}

export async function loginWithWechat() {
  const code = await wxLogin();
  const response = await rawRequest('/auth/wechat', 'POST', { code });
  const result = response.data;
  if (result.status === 'bound') {
    setAuth(result.token, result.member);
    return result;
  }
  clearAuth();
  return result;
}

export async function bindWechatMember({ kind, inviteCode, displayName }) {
  const code = await wxLogin();
  const response = await rawRequest('/auth/bind', 'POST', {
    code,
    kind,
    inviteCode,
    displayName,
  });
  setAuth(response.data.token, response.data.member);
  return response.data.member;
}

export async function ensureLogin(force = false) {
  if (!force && getToken() && getStoredMember()) {
    return getStoredMember();
  }
  const result = await loginWithWechat();
  if (result.status !== 'bound') {
    uni.reLaunch({ url: '/pages/bind/bind' });
    throw new ApiError(403, 'BIND_REQUIRED', '需要绑定家庭成员');
  }
  return result.member;
}
```

修改 `miniprogram/src/utils/index.js`：

```js
import { rawRequest, ApiError } from './http.js';
import { getToken } from './token.js';
import { ensureLogin, getMember } from './auth.js';

export { getMember, ApiError };

export async function request(path, method = 'GET', body, options = {}) {
  try {
    const response = await rawRequest(path, method, body, { token: getToken() });
    return response.data;
  } catch (error) {
    if (error.status === 401 && !options.retried) {
      await ensureLogin(true);
      return request(path, method, body, { ...options, retried: true });
    }
    throw error;
  }
}

export function toast(title) {
  uni.showToast({ title, icon: 'none', duration: 1800 });
}
```

- [ ] **Step 5: 运行小程序认证测试**

Run: `npm test`

Expected: 现有问候语测试和新增认证测试全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add miniprogram/src/utils/http.js miniprogram/src/utils/token.js miniprogram/src/utils/auth.js miniprogram/src/utils/index.js miniprogram/tests/auth.test.js
git commit -m "feat: add mini program automatic WeChat authentication"
```

---

## Task 7: 绑定页和首页自动登录

**Files:**
- Create: `miniprogram/src/pages/bind/bind.vue`
- Modify: `miniprogram/src/pages.json`
- Modify: `miniprogram/src/pages/today/today.vue`
- Test: `miniprogram/tests/auth.test.js`

**Interfaces:**

Consumes：

- `bindWechatMember({ kind, inviteCode, displayName })`
- `ensureLogin(force = false)`
- `getMember()`

Produces：

- 首次未绑定用户进入 `pages/bind/bind`
- 已绑定用户启动后直接进入首页
- 首页只显示问候语、显示名和角色标签

- [ ] **Step 1: 写绑定页行为测试**

在 `miniprogram/tests/auth.test.js` 增加：

```js
test('正确绑定后保存成员并返回成员信息', async () => {
  let requestBody;
  globalThis.uni.request = ({ data, success }) => {
    requestBody = data;
    success({
      statusCode: 200,
      data: {
        ok: true,
        data: {
          status: 'bound',
          token: 'token-family',
          member: {
            id: 'member-family',
            name: '妈妈',
            role: 'member',
            color: '#5B8C5A',
          },
        },
      },
    });
  };
  const member = await auth.bindWechatMember({
    kind: 'family',
    inviteCode: 'family-code-123',
    displayName: '妈妈',
  });
  assert.equal(requestBody.kind, 'family');
  assert.equal(member.name, '妈妈');
  assert.equal(auth.getTokenValue(), 'token-family');
});
```

- [ ] **Step 2: 运行测试确认绑定逻辑通过**

Run: `npm test`

Expected: 新增测试 PASS；如果认证模块测试仍未通过，先修复 Task 6。

- [ ] **Step 3: 创建绑定页**

`miniprogram/src/pages/bind/bind.vue`：

```vue
<template>
  <view class="bind-page">
    <view class="bind-title">加入这个家</view>
    <view class="bind-subtitle">第一次进入需要绑定微信身份，之后会自动登录。</view>
    <view class="kind-row">
      <view :class="['kind', kind === 'chef' ? 'on' : '']" @tap="kind = 'chef'">主厨</view>
      <view :class="['kind', kind === 'member' ? 'on' : '']" @tap="kind = 'member'">家人</view>
    </view>
    <input v-model="displayName" class="input" maxlength="20" placeholder="显示名，例如：爸爸" />
    <input v-model="inviteCode" class="input" password placeholder="首次绑定口令" />
    <view class="tip">口令只用于第一次绑定，之后由微信自动识别。</view>
    <button class="primary" :loading="loading" @tap="submit">绑定并进入</button>
  </view>
</template>

<script>
import { bindWechatMember } from '../../utils/auth.js';
import { toast } from '../../utils/index.js';

export default {
  data() {
    return { kind: 'member', displayName: '', inviteCode: '', loading: false };
  },
  methods: {
    async submit() {
      const name = this.displayName.trim();
      if (!name) return toast('先填写显示名');
      if (!this.inviteCode) return toast('先填写绑定口令');
      this.loading = true;
      try {
        await bindWechatMember({
          kind: this.kind === 'chef' ? 'chef' : 'family',
          inviteCode: this.inviteCode,
          displayName: name,
        });
        toast('绑定成功');
        uni.switchTab({ url: '/pages/today/today' });
      } catch (error) {
        toast(error.message);
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style>
.bind-page { padding: 48rpx 36rpx; }
.bind-title { font-size: 52rpx; font-weight: 700; }
.bind-subtitle { margin-top: 16rpx; color: #8A8077; font-size: 26rpx; }
.kind-row { display: flex; gap: 20rpx; margin: 48rpx 0 28rpx; }
.kind { flex: 1; text-align: center; padding: 24rpx; border: 1rpx solid #EFE7DC; border-radius: 20rpx; background: #FFFFFF; }
.kind.on { color: #4F7A4E; border-color: #5B8C5A; background: #EAF2E7; font-weight: 600; }
.input { display: block; width: 100%; padding: 26rpx 28rpx; margin-bottom: 20rpx; border-radius: 18rpx; background: #FFFFFF; }
.tip { color: #8A8077; font-size: 24rpx; margin: 8rpx 0 30rpx; }
.primary { width: 100%; background: #5B8C5A; color: #FFFFFF; border-radius: 20rpx; }
</style>
```

- [ ] **Step 4: 注册页面并改造首页**

在 `miniprogram/src/pages.json` 的页面数组中增加：

```json
{ "path": "pages/bind/bind", "style": { "navigationBarTitleText": "绑定家庭成员" } }
```

修改 `miniprogram/src/pages/today/today.vue`：

- 删除“你是谁？”身份选择区域。
- 删除 `members` 数据、`pickMember` 方法、`saveMember` 和 `clearMember` 导入。
- 用 `ensureLogin()` 替换 `getMember()`。

核心脚本：

```js
import { request, toast, getMember } from '../../utils/index.js';
import { ensureLogin } from '../../utils/auth.js';
import { getGreeting } from '../../utils/greeting.js';

export default {
  data() {
    return {
      member: getMember(),
      greeting: getGreeting(),
      meals: [],
    };
  },
  async onShow() {
    this.scheduleGreetingRefresh();
    try {
      this.member = await ensureLogin();
      await this.init();
    } catch (error) {
      if (error.code !== 'BIND_REQUIRED') toast(error.message);
    }
  },
  methods: {
    async init() {
      try {
        this.meals = await request('/meals');
      } catch (error) {
        toast(error.message);
      }
    },
  },
};
```

主内容外层增加 `v-if="member"`，避免绑定页跳转前读取空成员：

```vue
<view v-if="member">
  <view class="hello">
    {{ greetingLine }}
    <text class="role-chip">{{ member.role === 'chef' ? '主厨' : '家人' }}</text>
  </view>
</view>
```

顶部身份栏仅保留：

```vue
<view class="hello">
  {{ greetingLine }}
  <text class="role-chip">{{ member.role === 'chef' ? '主厨' : '家人' }}</text>
</view>
```

- [ ] **Step 5: 构建并检查产物**

Run: `npm test`

Expected: 全部 PASS。

Run: `npm run build:mp-weixin`

Expected: `DONE Build complete.`。

Run: `rg -n "你是谁|pickMember|switchIdentity|x-member-id" dist/build/mp-weixin`

Expected: 无匹配项。

- [ ] **Step 6: 提交**

```bash
git add miniprogram/src/pages/bind/bind.vue miniprogram/src/pages.json miniprogram/src/pages/today/today.vue miniprogram/tests/auth.test.js
git commit -m "feat: add WeChat member binding page and automatic login"
```

---

## Task 8: 生产地址、AppID、Docker、Caddy 和备份

**Files:**
- Modify: `miniprogram/src/utils/http.js`
- Modify: `miniprogram/src/manifest.json`
- Modify: `.gitignore`
- Create: `backend/Dockerfile`
- Create: `docker-compose.yml`
- Create: `deploy/Caddyfile`
- Create: `deploy/.env.example`
- Create: `backend/scripts/backup.js`
- Create: `deploy/README.md`

**Interfaces:**

Consumes：

- 小程序生产 API 地址 `https://api.<正式域名>`
- 后端环境变量 `WX_APPID`、`WX_SECRET`、`CHEF_BIND_CODE`、`FAMILY_INVITE_CODE`

Produces：

- `docker compose up -d --build` 启动 app 和 caddy
- `GET /health` 返回 `{"ok":true,"data":{"status":"ok"}}`
- `node backend/scripts/backup.js` 生成一致性备份

- [ ] **Step 1: 切换生产 API 地址和 AppID**

将 `miniprogram/src/utils/http.js` 的地址选择改为：

```js
const DEV_BASE_URL = 'http://localhost:8080';
const PROD_BASE_URL = 'https://api.example.com';

export const BASE_URL = import.meta.env.DEV ? DEV_BASE_URL : PROD_BASE_URL;
```

执行时将 `api.example.com` 替换为已经完成备案并解析到腾讯云的正式域名。

修改 `miniprogram/src/manifest.json`：

```json
"appid": "你的小程序AppID",
"mp-weixin": {
  "appid": "你的小程序AppID",
  "setting": {
    "urlCheck": true
  },
  "usingComponents": true
}
```

不要把 AppSecret 写入 `manifest.json`。

- [ ] **Step 2: 创建容器和 Caddy 配置**

`backend/Dockerfile`：

```dockerfile
FROM node:24-bookworm-slim

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p /app/data

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "src/server.js"]
```

`docker-compose.yml`：

```yaml
services:
  app:
    build: ./backend
    restart: unless-stopped
    env_file:
      - ./deploy/.env.production
    volumes:
      - ./data:/app/data
    expose:
      - "8080"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    environment:
      DOMAIN: ${DOMAIN}
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - app
volumes:
  caddy_data:
  caddy_config:
```

`deploy/Caddyfile`：

```caddyfile
{$DOMAIN} {
  encode zstd gzip
  reverse_proxy app:8080
}
```

`deploy/.env.example`：

```env
DOMAIN=api.example.com
NODE_ENV=production
AUTH_MODE=wechat
WX_APPID=replace-with-wechat-appid
WX_SECRET=replace-with-wechat-secret
CHEF_BIND_CODE=replace-with-a-random-chef-code
FAMILY_INVITE_CODE=replace-with-a-random-family-code
SESSION_TTL_DAYS=30
DATA_DIR=/app/data
```

`.gitignore` 增加：

```gitignore
deploy/.env.production
data/
data/backups/
```

- [ ] **Step 3: 实现一致性备份脚本**

`backend/scripts/backup.js`：

```js
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const dataDir = process.env.DATA_DIR || '/app/data';
const backupDir = join(dataDir, 'backups');
mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = join(backupDir, `app-${stamp}.db`);
const db = new DatabaseSync(join(dataDir, 'app.db'));

db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
db.close();

const backups = readdirSync(backupDir)
  .filter((name) => name.startsWith('app-') && name.endsWith('.db'))
  .sort();
for (const old of backups.slice(0, -30)) {
  unlinkSync(join(backupDir, old));
}

console.log(`backup created: ${target}`);
```

- [ ] **Step 4: 写腾讯云部署手册**

`deploy/README.md` 至少包含以下步骤：

```markdown
# 腾讯云部署

1. 腾讯云轻量应用服务器选择系统镜像 Ubuntu Server 24.04 LTS 64 位，2 核 2G、40GB SSD。
2. 安装 Docker Engine 和 Docker Compose 插件。
3. 域名 A 记录指向服务器公网 IP，完成 ICP 备案。
4. 将仓库部署到服务器，在 deploy/.env.production 中填写真实环境变量。
5. 执行 `docker compose --env-file deploy/.env.production up -d --build`。
6. 执行 `curl https://$DOMAIN/health`，预期返回 `{"ok":true,"data":{"status":"ok"}}`。
7. 在微信公众平台开发设置中把 `https://$DOMAIN` 配置为 request 合法域名。
8. 每日执行 `docker compose --env-file deploy/.env.production exec app node scripts/backup.js`。
9. 回滚时在部署记录中找到上一个提交哈希，执行 `git switch <COMMIT_HASH>`，再执行 `docker compose --env-file deploy/.env.production up -d --build`。
```

- [ ] **Step 5: 校验容器和脚本**

Run: `node --check backend/scripts/backup.js`

Expected: 退出码 0。

Run: `Copy-Item deploy/.env.example deploy/.env.production`

Expected: 本机出现仅用于配置校验的 `deploy/.env.production`，该文件被 `.gitignore` 忽略。

Run: `docker compose --env-file deploy/.env.production config`

Expected: 输出完整配置且无 YAML 错误。

如果本机没有 Docker，在腾讯云服务器上执行同一命令，并把输出保存到部署记录。

- [ ] **Step 6: 提交**

```bash
git add miniprogram/src/utils/http.js miniprogram/src/manifest.json .gitignore backend/Dockerfile docker-compose.yml deploy/Caddyfile deploy/.env.example backend/scripts/backup.js deploy/README.md
git commit -m "chore: add production deployment and backup configuration"
```

---

## Task 9: 上线清单、回归验证和最终提交

**Files:**
- Create: `docs/08-wechat-openid-release-checklist.md`
- Modify: `docs/06-miniprogram-plan.md`
- Modify: `docs/07-wechat-import-guide.md`
- Test: `backend/tests/*.test.js`
- Test: `miniprogram/tests/*.test.js`

**Interfaces:**

Consumes：

- 前八个任务完成的认证、绑定、权限和部署文件

Produces：

- 可照做的微信体验版和正式版上线清单
- 可重复的全量回归命令

- [ ] **Step 1: 写上线检查清单**

`docs/08-wechat-openid-release-checklist.md`：

```markdown
# 微信小程序上线检查清单

## 腾讯云和域名
- [ ] 轻量应用服务器为 Ubuntu Server 24.04 LTS 64 位。
- [ ] 服务器地域在中国大陆，公网 IP 已绑定域名 A 记录。
- [ ] ICP 备案已通过。
- [ ] 防火墙只开放 80、443 和受限来源 SSH。
- [ ] Caddy 已签发有效 HTTPS 证书。

## 后端环境
- [ ] `NODE_ENV=production`。
- [ ] `AUTH_MODE=wechat`。
- [ ] `WX_APPID` 和小程序后台一致。
- [ ] `WX_SECRET` 只存在服务器，未进入 Git 和小程序包。
- [ ] `CHEF_BIND_CODE` 和 `FAMILY_INVITE_CODE` 均至少 12 个字符。
- [ ] 两个绑定口令已保存在密码管理器。

## 微信后台
- [ ] request 合法域名填写 `https://api.<域名>`。
- [ ] 未填写 `api.weixin.qq.com`。
- [ ] 小程序 AppID 已填入 manifest。
- [ ] `urlCheck` 已开启。
- [ ] 用户隐私保护指引已填写 openid 用途。

## 双账号验收
- [ ] 主厨微信首次绑定成功。
- [ ] 家人微信首次绑定成功。
- [ ] 第三个微信无法进入。
- [ ] 主厨能开饭、关饭、编辑菜谱和库存。
- [ ] 家人只能查看和点菜。
- [ ] 点菜提交人显示正确。
- [ ] 两位成员点同一道菜时审计记录有两条。
- [ ] token 过期后自动重新登录。

## 备份和发布
- [ ] `GET /health` 返回正常。
- [ ] `node scripts/backup.js` 能生成备份。
- [ ] 备份文件可以打开并读到成员、菜谱和饭局数据。
- [ ] 关闭开发者工具域名跳过后真机可访问。
- [ ] 体验版双账号联调完成。
- [ ] 已提交审核并发布正式版。
```

- [ ] **Step 2: 更新现有开发文档**

在 `docs/06-miniprogram-plan.md` 中把“真实登录暂不做”更新为指向本设计和计划。

在 `docs/07-wechat-import-guide.md` 增加：

```markdown
## 正式环境

- 使用正式 AppID，不要把 AppSecret 写入小程序。
- request 合法域名必须是 `https://api.<域名>`。
- 正式构建必须设置 `urlCheck: true`。
- 首次进入按角色输入主厨口令或家庭邀请码。
```

- [ ] **Step 3: 运行后端全量回归**

Run: `cd backend; npm test`

Expected: 所有测试 PASS。

Run: `node --check src/server.js`

Expected: 退出码 0。

- [ ] **Step 4: 运行小程序全量回归和构建**

Run: `cd miniprogram; npm test`

Expected: 所有测试 PASS。

Run: `cd miniprogram; npm run build:mp-weixin`

Expected: `DONE Build complete.`。

- [ ] **Step 5: 检查代码和产物中没有敏感信息**

Run: `git grep -n "WX_SECRET=.*[^=]$" -- ':!deploy/.env.example'`

Expected: 无匹配项。

Run: `git grep -n "session_key" -- backend/src miniprogram/src`

Expected: 只在微信客户端测试或明确的丢弃逻辑中出现，不返回客户端。

Run: `git diff --check`

Expected: 没有空白错误，只有 Git 的 CRLF 提示可以接受。

- [ ] **Step 6: 最终提交**

```bash
git add docs/08-wechat-openid-release-checklist.md docs/06-miniprogram-plan.md docs/07-wechat-import-guide.md
git commit -m "docs: add WeChat production release checklist"
```

---

## 执行完成后的验收

完成以上任务后，执行者必须汇报：

1. 所有后端测试的实际通过数量。
2. 所有小程序测试的实际通过数量。
3. `npm run build:mp-weixin` 的实际结果。
4. `docker compose --env-file deploy/.env.production config` 的实际结果。
5. `GET /health` 的实际响应。
6. 两个微信账号的绑定和权限验收结果。
7. 仍未完成的外部事项，只允许是 ICP 备案审核、微信审核或真实 AppID/域名的配置等待。
