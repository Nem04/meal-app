# 多微信成员绑定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 允许任意多个微信使用同一个主厨码或家人码加入，每个微信拥有独立成员身份，角色由绑定时选择的口令决定。

**Architecture:** 保留 `family_member`、`auth_session` 和 `meal_item_submission` 结构；新微信绑定时创建独立 `family_member`，不再争夺 `member-chef` / `member-family` 固定槽位。主厨码始终授予 `chef`，家人码始终授予 `member`，每个微信各自拥有显示名和会话。

**Tech Stack:** Node.js 24、node:sqlite、uni-app Vue 3、微信小程序。

**Spec:** [2026-11-05-multi-wechat-binding-design.md](../specs/2026-11-05-multi-wechat-binding-design.md)

## Global Constraints

- 一个微信 openid 只能绑定一条 `family_member` 记录。
- 多个不同 openid 可以使用同一个 `CHEF_BIND_CODE`，均获得 `chef` 角色。
- 多个不同 openid 可以使用同一个 `FAMILY_INVITE_CODE`，均获得 `member` 角色。
- 每个微信必须有自己的显示名，显示名长度为 1 到 20 个字符。
- 同一 openid 重复绑定返回 `OPENID_ALREADY_BOUND`，不得创建第二条成员记录。
- 旧的 `member-chef` / `member-family` 记录和历史数据必须保留。
- `AUTH_MODE=wechat` 下，成员列表只展示 `openid IS NOT NULL` 的已绑定成员。
- `AUTH_MODE=legacy` 的本地网页版行为保持可用。
- 任何客户端传入的 `x-member-id`、`submitter`、`created_by`、`operator` 不得覆盖会话身份。
- token 明文、openid、AppSecret、绑定口令和 `session_key` 不得写入小程序包或日志。
- 每个任务完成后单独提交，不把无关改动放入提交。

---

## Task 1: 仓储层支持多个微信成员

**Files:**
- Modify: `backend/src/repo.js`
- Test: `backend/tests/authRepo.test.js`

**Interfaces:**

Consumes：

- `newId(): string`
- `AppError(status, code, message)`
- `db(): DatabaseSync`

Produces：

- `bindMemberAccount({ openid, role, name, color, boundAt }): Member`
- `listBoundMembers(): Member[]`

- [ ] **Step 1: 写多成员仓储失败测试**

在 `backend/tests/authRepo.test.js` 增加：

```js
test('多个 openid 可以创建多个同角色成员', () => {
  const first = repo.bindMemberAccount({
    openid: 'openid-chef-a',
    role: 'chef',
    name: '爸爸',
    color: '#D96A3B',
    boundAt: '2026-11-05T00:00:00.000Z',
  });
  const second = repo.bindMemberAccount({
    openid: 'openid-chef-b',
    role: 'chef',
    name: '爷爷',
    color: '#D96A3B',
    boundAt: '2026-11-05T00:01:00.000Z',
  });

  assert.notEqual(first.id, second.id);
  assert.equal(first.role, 'chef');
  assert.equal(second.role, 'chef');
  assert.equal(repo.listBoundMembers().filter((m) => m.role === 'chef').length, 2);
});

test('同一个 openid 不能创建两条成员记录', () => {
  repo.bindMemberAccount({
    openid: 'openid-duplicate',
    role: 'member',
    name: '妈妈',
    color: '#5B8C5A',
    boundAt: '2026-11-05T00:00:00.000Z',
  });

  assert.throws(
    () => repo.bindMemberAccount({
      openid: 'openid-duplicate',
      role: 'chef',
      name: '另一个人',
      color: '#D96A3B',
      boundAt: '2026-11-05T00:01:00.000Z',
    }),
    (error) => error.code === 'OPENID_ALREADY_BOUND',
  );
  assert.equal(
    repo.listBoundMembers().filter((m) => m.openid === 'openid-duplicate').length,
    1,
  );
});

test('已绑定成员列表不包含未绑定的历史种子槽位', () => {
  assert.equal(repo.listBoundMembers().length, 0);
  repo.bindMemberAccount({
    openid: 'openid-family',
    role: 'member',
    name: '妈妈',
    color: '#5B8C5A',
    boundAt: '2026-11-05T00:00:00.000Z',
  });

  const bound = repo.listBoundMembers();
  assert.equal(bound.length, 1);
  assert.equal(bound[0].openid, 'openid-family');
  assert.ok(bound.every((m) => m.openid !== null));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/authRepo.test.js`

Expected: FAIL，因为 `bindMemberAccount` 和 `listBoundMembers` 尚不存在。

- [ ] **Step 3: 实现仓储函数**

在 `backend/src/repo.js` 的成员区域增加：

```js
export function bindMemberAccount({ openid, role, name, color, boundAt }) {
  const d = db();
  d.exec('BEGIN IMMEDIATE');
  try {
    const existing = d.prepare('SELECT * FROM family_member WHERE openid = ?').get(openid);
    if (existing) {
      throw new AppError(409, 'OPENID_ALREADY_BOUND', '这个微信已经绑定家庭成员');
    }
    const id = newId();
    const createdAt = new Date().toISOString();
    d.prepare(
      'INSERT INTO family_member(id,name,role,color,openid,bound_at,created_at) VALUES(?,?,?,?,?,?,?)',
    ).run(id, name, role, color, openid, boundAt, createdAt);
    d.exec('COMMIT');
    return d.prepare('SELECT * FROM family_member WHERE id = ?').get(id);
  } catch (error) {
    d.exec('ROLLBACK');
    throw error;
  }
}

export function listBoundMembers() {
  return db().prepare(
    'SELECT * FROM family_member WHERE openid IS NOT NULL ORDER BY role DESC, created_at ASC',
  ).all();
}
```

保留现有 `bindMemberSlot`，供旧本地网页和兼容测试使用；新绑定逻辑不调用它。

- [ ] **Step 4: 运行仓储测试**

Run: `node --test tests/authRepo.test.js`

Expected: PASS。

Run: `npm test`

Expected: 现有后端测试继续通过。

- [ ] **Step 5: 提交**

```bash
git add backend/src/repo.js backend/tests/authRepo.test.js
git commit -m "feat: support multiple WeChat member identities"
```

---

## Task 2: 服务层按共享口令授予角色

**Files:**
- Modify: `backend/src/services.js`
- Modify: `backend/tests/authService.test.js`

**Interfaces:**

Consumes：

- `repo.bindMemberAccount({ openid, role, name, color, boundAt })`
- `repo.getMemberByOpenid(openid)`
- `verifyBindCode(kind, inviteCode, appConfig)`

Produces：

- `bindWechatMember(...)` 在未绑定 openid 上创建新成员
- `listBoundMembers(): Member[]`

- [ ] **Step 1: 写多主厨、多家人服务测试**

在 `backend/tests/authService.test.js` 增加：

```js
test('多个微信使用同一个主厨码都成为主厨', async () => {
  const members = [];
  for (const [openid, name] of [
    ['openid-chef-a', '爸爸'],
    ['openid-chef-b', '爷爷'],
    ['openid-chef-c', '叔叔'],
  ]) {
    const result = await svc.bindWechatMember({
      code: 'good-code',
      kind: 'chef',
      inviteCode: 'chef-code-12345',
      displayName: name,
      wechatClient: fakeWechat(openid),
      appConfig,
    });
    members.push(result.member);
  }

  assert.equal(new Set(members.map((m) => m.id)).size, 3);
  assert.ok(members.every((m) => m.role === 'chef'));
  assert.equal(svc.listBoundMembers().filter((m) => m.role === 'chef').length, 3);
});

test('多个微信使用同一个家人码都成为家人', async () => {
  const members = [];
  for (const [openid, name] of [
    ['openid-family-a', '妈妈'],
    ['openid-family-b', '奶奶'],
  ]) {
    const result = await svc.bindWechatMember({
      code: 'good-code',
      kind: 'family',
      inviteCode: 'family-code-123',
      displayName: name,
      wechatClient: fakeWechat(openid),
      appConfig,
    });
    members.push(result.member);
  }

  assert.equal(new Set(members.map((m) => m.id)).size, 2);
  assert.ok(members.every((m) => m.role === 'member'));
});

test('同一个微信重复绑定被拒绝且不新增成员', async () => {
  await svc.bindWechatMember({
    code: 'good-code',
    kind: 'family',
    inviteCode: 'family-code-123',
    displayName: '妈妈',
    wechatClient: fakeWechat('openid-repeat'),
    appConfig,
  });

  const before = svc.listBoundMembers().length;
  await assert.rejects(
    () => svc.bindWechatMember({
      code: 'good-code',
      kind: 'chef',
      inviteCode: 'chef-code-12345',
      displayName: '另一个人',
      wechatClient: fakeWechat('openid-repeat'),
      appConfig,
    }),
    (error) => error.code === 'OPENID_ALREADY_BOUND',
  );
  assert.equal(svc.listBoundMembers().length, before);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/authService.test.js`

Expected: FAIL，因为当前 `bindWechatMember` 仍使用固定 `MEMBER_SLOTS`，第二个主厨绑定会返回槽位已绑定。

- [ ] **Step 3: 改写服务层绑定逻辑**

同时更新现有测试中仍依赖固定槽位 ID 的断言。`member-chef` 和
`member-family` 只作为历史记录，不再代表新微信的绑定目标：

```diff
- assert.equal(repo.getMemberByOpenid('openid-chef').id, 'member-chef');
+ assert.equal(repo.getMemberByOpenid('openid-chef').role, 'chef');
+ assert.equal(repo.getMemberByOpenid('openid-chef').name, '爸爸');

- assert.equal(auth.member.id, 'member-family');
+ assert.equal(auth.member.role, 'member');
+ assert.equal(repo.getMemberByOpenid('openid-family').id, auth.member.id);
```

在 `backend/src/services.js` 增加角色映射：

```js
const ROLE_BY_KIND = {
  chef: 'chef',
  family: 'member',
};

const COLOR_BY_ROLE = {
  chef: '#D96A3B',
  member: '#5B8C5A',
};

export function listBoundMembers() {
  return repo.listBoundMembers();
}
```

将 `bindWechatMember` 的核心替换为：

```js
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
```

删除 `MEMBER_SLOTS` 和 `repo.bindMemberSlot` 的调用。保留 `verifyBindCode`、限流 key 和 `issueSession` 不变。

- [ ] **Step 4: 运行服务层测试**

Run: `node --test tests/authService.test.js`

Expected: PASS。

Run: `npm test`

Expected: 全部后端测试通过。

- [ ] **Step 5: 提交**

```bash
git add backend/src/services.js backend/tests/authService.test.js
git commit -m "feat: grant roles through shared invite codes"
```

---

## Task 3: HTTP 与小程序支持共享口令

**Files:**
- Modify: `backend/src/routes.js`
- Modify: `backend/tests/authHttp.test.js`
- Modify: `miniprogram/src/pages/bind/bind.vue`

**Interfaces:**

Consumes：

- `svc.listBoundMembers()`
- `svc.serializeMember(member)`
- `bindWechatMember({ kind, inviteCode, displayName })`

Produces：

- `GET /api/members` 在微信模式只返回已绑定成员
- 绑定页说明同一个口令可供多个微信使用
- `OPENID_ALREADY_BOUND` 时回到首页自动登录

- [ ] **Step 1: 写 HTTP 多成员测试**

在 `backend/tests/authHttp.test.js` 增加：

```js
test('多个微信可用同一个主厨码绑定，成员列表只返回已绑定成员', async () => {
  const names = ['主厨甲', '主厨乙'];
  const tokens = [];
  for (let i = 0; i < names.length; i += 1) {
    nextOpenid = `openid-chef-${i}`;
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
        displayName: names[i],
      }),
    });
    const body = await bind.json();
    assert.equal(body.data.member.role, 'chef');
    tokens.push(body.data.token);
  }

  const members = await fetch(`${baseUrl}/members`, {
    headers: { Authorization: `Bearer ${tokens[0]}` },
  });
  const body = await members.json();
  const matching = body.data.filter((m) => names.includes(m.name));
  assert.equal(matching.length, 2);
  assert.deepEqual(matching.map((m) => m.name).sort(), ['主厨乙', '主厨甲'].sort());
  assert.ok(matching.every((m) => m.role === 'chef'));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/authHttp.test.js`

Expected: FAIL，因为第二次主厨绑定仍会命中固定槽位已绑定。

- [ ] **Step 3: 修改 HTTP 成员列表**

在 `backend/src/routes.js` 的 `handleMembers` 中，将微信模式的 GET 分支改为：

```js
if (method === 'GET') {
  const members = config.authMode === 'wechat'
    ? svc.listBoundMembers()
    : svc.listMembers();
  return ok(res, members.map(svc.serializeMember));
}
```

微信模式下不得返回未绑定种子槽位；legacy 模式继续使用原有 `listMembers()`。

- [ ] **Step 4: 更新绑定页文案和重复绑定处理**

在 `miniprogram/src/pages/bind/bind.vue` 修改提示文案：

```vue
<view class="bind-subtitle">
  第一次进入需要绑定微信身份，之后会自动登录。同一个主厨码可由多个微信使用，使用主厨码进入都会获得主厨权限。
</view>
<view class="tip">
  主厨码和家人码都可以供多个微信使用；请只发给家庭成员。
</view>
```

在 `submit()` 的 `catch` 中处理重复绑定：

```js
} catch (error) {
  if (error.code === 'OPENID_ALREADY_BOUND') {
    uni.switchTab({ url: '/pages/today/today' });
    return;
  }
  toast(error.message);
} finally {
  this.loading = false;
}
```

- [ ] **Step 5: 运行 HTTP、小程序测试和构建**

Run: `cd backend; node --test tests/authHttp.test.js`

Expected: PASS。

Run: `cd miniprogram; npm test`

Expected: 现有 16 项测试通过。

Run: `cd miniprogram; npm run build:mp-weixin`

Expected: `DONE Build complete.`。

- [ ] **Step 6: 提交**

```bash
git add backend/src/routes.js backend/tests/authHttp.test.js miniprogram/src/pages/bind/bind.vue
git commit -m "feat: support shared invite codes across WeChat accounts"
```

---

## Task 4: 更新上线清单并做全量验收

**Files:**
- Modify: `docs/08-wechat-openid-release-checklist.md`
- Modify: `docs/07-wechat-import-guide.md`
- Test: backend and miniprogram suites

**Interfaces:**

Consumes：

- 多微信绑定、角色权限和成员列表行为

Produces：

- 可执行的多账号上线验收清单
- 正式环境共享口令说明

- [ ] **Step 1: 更新上线验收项**

将 `docs/08-wechat-openid-release-checklist.md` 中原来的“第三个微信无法进入”替换为：

```markdown
- [ ] 未输入任何口令的陌生微信无法进入。
- [ ] 多个微信使用同一个主厨码进入后，均显示主厨角色并可编辑。
- [ ] 多个微信使用同一个家人码进入后，均只可查看和点菜。
- [ ] 同一微信重复进入不会产生重复成员。
```

在双账号验收区域增加：

```markdown
- [ ] 三个以上微信分别使用主厨码和家人码联调通过。
- [ ] 多个主厨修改库存后，其他主厨可以看到最新数据。
```

- [ ] **Step 2: 更新导入指引**

在 `docs/07-wechat-import-guide.md` 的正式环境章节增加：

```markdown
- 主厨码和家人码都可以供多个微信使用；主厨码会授予主厨权限，请只发给家庭成员。
- 每个微信首次绑定都需要填写自己的显示名，以便区分点菜和操作记录。
```

- [ ] **Step 3: 运行完整回归**

Run: `cd backend; npm test`

Expected: 全部 PASS。

Run: `cd miniprogram; npm test`

Expected: 全部 PASS。

Run: `cd miniprogram; npm run build:mp-weixin`

Expected: `DONE Build complete.`。

Run: `git diff --check`

Expected: 无空白错误。

- [ ] **Step 4: 手工多账号验收**

在微信开发者工具或局域网真机中：

1. 用三个不同微信分别输入同一个主厨码。
2. 确认三个账号都显示“主厨”，且都能打开库存和菜谱编辑。
3. 用两个不同微信输入同一个家人码。
4. 确认两个账号都只能查看和点菜。
5. 用同一微信再次进入，确认不新增成员。
6. 用两个不同主厨点同一道菜，确认饭局提交审计有两条不同成员记录。

- [ ] **Step 5: 提交**

```bash
git add docs/08-wechat-openid-release-checklist.md docs/07-wechat-import-guide.md
git commit -m "docs: update multi-WeChat release checklist"
```

---

## 完成后验收

1. 多个不同微信使用主厨码，均获得 `chef` 角色。
2. 多个不同微信使用家人码，均获得 `member` 角色。
3. 同一 openid 不会创建第二条成员记录。
4. 成员列表只显示已绑定成员，不展示未绑定历史槽位。
5. 点菜、库存和开饭归属都能区分具体微信。
6. 旧成员、旧会话、旧饭局、库存、菜谱和日志保持可用。
7. 后端测试、小程序测试和微信小程序构建全部通过。
