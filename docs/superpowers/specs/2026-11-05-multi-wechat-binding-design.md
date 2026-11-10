# 多微信成员绑定设计

> 日期：2026-11-05
> 状态：待评审
> 范围：微信小程序登录绑定模型；不改变现有饭局、库存、菜谱和日志数据结构

## 1. 目标

把当前“两个固定成员槽位各绑定一个微信”的模型，改成“每个微信创建独立成员身份，角色由首次绑定口令决定”：

- 多个微信可以使用同一个主厨验证码，所有使用者都获得主厨权限。
- 多个微信可以使用同一个家人邀请码，所有使用者都获得家人权限。
- 每个微信保留自己的显示名，点菜提交人、库存操作人和日志归属仍能区分具体是谁。
- 已有的饭局、点菜、库存、菜谱和日志数据继续可用。
- 同一个微信重复绑定不会创建重复成员。

## 2. 当前模型

当前实现使用两个固定槽位：

| 槽位 | 角色 | 凭证 |
|---|---|---|
| `member-chef` | `chef` | `CHEF_BIND_CODE` |
| `member-family` | `member` | `FAMILY_INVITE_CODE` |

`family_member.openid` 是单个字段，`bindMemberSlot` 会更新固定槽位。槽位已有 openid 时返回 `MEMBER_ALREADY_BOUND`，因此只有两个微信可以进入。

## 3. 新模型

### 3.1 成员身份

`family_member` 继续作为成员身份表，但语义改为：

- 每新增一个微信，就新增一条独立的 `family_member` 记录。
- `role` 由绑定口令类型决定：
  - `kind = chef` 且主厨码正确 → `role = chef`
  - `kind = family` 且家人码正确 → `role = member`
- `name` 保存该微信用户自己的显示名。
- `openid` 保存该微信的 openid，继续保持唯一索引。
- `bound_at` 保存首次绑定时间。

旧的 `member-chef` 和 `member-family` 记录继续保留，用于兼容已有数据和历史引用；新微信不再争夺这两个固定槽位。

### 3.2 角色与权限

角色只由成员记录的 `role` 决定，不由固定槽位 ID 决定：

- 任意 `role = chef` 的已绑定成员都可以执行现有主厨操作。
- 任意 `role = member` 的已绑定成员只能查看和点菜。
- 多个主厨成员之间不区分主次，不引入“第一主厨”或“主厨转让”概念。

### 3.3 显示名和提交归属

每个微信首次绑定时必须填写 1 到 20 个字符的显示名：

- 点菜的 `submitter` 使用当前会话成员的显示名。
- `meal_item_submission.member_name_snapshot` 保存提交时的显示名快照。
- 库存操作的 `operator` 使用当前会话成员的显示名。
- 开饭的 `created_by` 使用当前会话成员的显示名。

两个微信可以有相同显示名，但仍是两个不同的成员 ID，审计记录不会合并。

## 4. 绑定流程

```text
小程序 wx.login()
  -> POST /api/auth/bind { code, kind, inviteCode, displayName }
  -> 后端用 code 换 openid
  -> 校验口令类型和口令
  -> 查询 openid 是否已经绑定
      -> 已绑定：拒绝重复绑定并提示直接登录
      -> 未绑定：创建新的 family_member
  -> 创建 auth_session
  -> 返回 token 和 member
```

主厨码和家人码可以被多个不同 openid 使用。口令本身不记录使用次数，也不和固定成员槽位绑定。

## 5. 数据模型

### 5.1 family_member

现有表字段继续使用：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT | 每个微信成员独立 ID |
| name | TEXT | 该微信用户的显示名 |
| role | TEXT | `chef` 或 `member` |
| color | TEXT | UI 标签颜色 |
| openid | TEXT NULL | 微信 openid |
| bound_at | TEXT NULL | 首次绑定时间 |
| created_at | TEXT | 创建时间 |

保留唯一索引：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_family_member_openid
ON family_member(openid)
WHERE openid IS NOT NULL;
```

新增成员时由服务端生成 ID，不覆盖固定槽位记录。

### 5.2 auth_session

保持现状：

- 一条会话关联一个 `family_member.id`。
- token 只保存 SHA-256 哈希。
- 会话有效期继续使用 `SESSION_TTL_DAYS`。
- 多个微信各自拥有独立会话，互不影响。

### 5.3 meal_item_submission

保持现状：

- `member_id` 指向具体微信成员。
- `member_name_snapshot` 保留提交时显示名。
- 多个主厨或家人点同一道菜时，仍按成员分别保留提交审计记录。

## 6. Repository 与服务层

新增或替换绑定仓储函数：

```text
bindMemberAccount({ openid, role, name, color, boundAt })
```

行为：

1. 在 `BEGIN IMMEDIATE` 事务中查询 openid。
2. openid 已存在时返回 `OPENID_ALREADY_BOUND`，不创建第二条记录。
3. openid 不存在时生成新成员 ID。
4. 插入 `family_member`，写入角色、显示名、颜色、openid 和绑定时间。
5. 返回新成员记录。

服务层：

```text
bindWechatMember({
  code,
  kind,
  inviteCode,
  displayName,
  wechatClient,
  appConfig,
  attemptLimiter,
  attemptKeyPrefix
})
```

行为调整为：

1. 验证微信 code。
2. 校验 `kind` 和对应口令。
3. 校验显示名。
4. 调用 `bindMemberAccount` 创建新成员。
5. 签发该成员独立会话。

不再使用 `MEMBER_SLOTS` 把绑定目标映射到 `member-chef` 或 `member-family`。

`listMembers` 只返回已绑定成员，即 `openid IS NOT NULL` 的记录，避免把历史种子槽位误显示为可登录成员。

## 7. API 行为

`POST /api/auth/bind` 请求结构保持不变：

```json
{
  "code": "wx.login 返回的一次性 code",
  "kind": "chef",
  "inviteCode": "主厨验证码",
  "displayName": "爸爸"
}
```

`kind` 仍为 `chef` 或 `family`。成功响应结构不变：

```json
{
  "status": "bound",
  "token": "仅本次返回的会话 token",
  "expiresAt": "2026-12-05T00:00:00.000Z",
  "member": {
    "id": "新成员ID",
    "name": "爸爸",
    "role": "chef",
    "color": "#D96A3B"
  }
}
```

错误规则：

| 场景 | 错误码 |
|---|---|
| 微信 code 无效 | `INVALID_LOGIN_CODE` |
| 主厨码或家人码错误 | `INVALID_INVITE_CODE` |
| 同一 openid 重复绑定 | `OPENID_ALREADY_BOUND` |
| 显示名不合法 | `INVALID_DISPLAY_NAME` |
| 口令失败次数过多 | `TOO_MANY_ATTEMPTS` |

同一个微信已经绑定时，小程序应清除绑定页状态并重新调用 `/api/auth/wechat`，而不是创建第二个成员。

## 8. 小程序界面

绑定页保留现有结构：

- 主厨 / 家人选择
- 显示名输入
- 首次绑定口令输入

文案调整为明确说明共享规则：

```text
同一个主厨验证码可供多个微信使用；使用主厨码进入的微信都会获得主厨权限。
同一个家人邀请码也可以供多个微信使用。
```

首页顶部的“问候语 + 姓名 + 角色标签”保持不变，不增加成员切换入口。

## 9. 数据迁移

不需要新增数据库表或字段，现有 `family_member` 结构已经支持多成员。

迁移只改变绑定逻辑：

1. 保留旧的 `member-chef`、`member-family` 记录及其历史引用。
2. 新绑定不复用已绑定的固定槽位。
3. 新成员使用独立 ID 插入。
4. `GET /members` 只读取已绑定成员。
5. 现有饭局、点菜、库存、菜谱和日志数据不删除、不重置。

## 10. 安全和运维

- 主厨验证码是共享管理员邀请码，任何拿到它的人都能获得主厨权限。
- 家人邀请码可以多人使用，不应公开传播。
- 建议首次加入完成后轮换主厨码和家庭邀请码；已绑定微信不受影响。
- 继续使用现有 IP + openid + kind 的失败次数限流。
- 继续只保存 token 哈希，不把 token 明文写入数据库。
- 不返回 openid、bound_at 或会话内部字段。
- 成员删除、解绑、角色变更和主厨转让不在本期范围；需要时使用服务端维护命令。

## 11. 测试

### 自动化测试

1. 三个不同 openid 使用同一个主厨码绑定，得到三个不同成员 ID，角色均为 `chef`。
2. 三个不同 openid 使用同一个家人码绑定，得到三个不同成员 ID，角色均为 `member`。
3. 同一 openid 重复调用绑定接口返回 `OPENID_ALREADY_BOUND`，成员表不新增记录。
4. 错误主厨码不能创建主厨成员。
5. 主厨成员可以开饭、编辑菜谱和修改库存。
6. 家人成员不能执行主厨操作，但可以点菜。
7. 两个不同主厨点同一道菜时，提交审计记录分别使用各自成员 ID 和显示名。
8. `GET /members` 不返回未绑定的历史槽位。
9. 旧数据迁移后，已有饭局、点菜、库存和日志保持不变。

### 手工验收

- 使用三个不同微信分别输入同一个主厨码，均应进入主厨首页。
- 使用三个不同微信分别输入同一个家人码，均应进入家人首页。
- 两个主厨账号都能编辑库存和菜谱。
- 两个家人账号都只能查看和点菜。
- 点菜后可以区分每个微信的提交记录。
- 同一个微信再次打开小程序时自动登录，不重复创建成员。

## 12. 验收标准

满足以下条件才完成：

1. 主厨码和家人码均不再限制只能绑定一个微信。
2. 每个新微信创建独立成员记录和独立显示名。
3. 所有使用主厨码的成员拥有主厨权限。
4. 所有使用家人码的成员只有家人权限。
5. 同一 openid 不会产生重复成员。
6. 点菜、库存和开饭归属能区分具体微信用户。
7. 旧成员、旧会话和旧业务数据保持可用。
8. 自动化测试全部通过，并在微信开发者工具完成多账号手工验收。

## 13. 非目标

- 不做成员管理后台。
- 不做在线解绑或角色切换。
- 不做主厨转让。
- 不做一次性邀请码或邀请码使用次数统计。
- 不做多家庭租户隔离。
