# 微信 openid 登录绑定与正式上线设计

> 日期：2026-11-04
> 状态：待评审
> 适用范围：微信小程序正式版；现有局域网网页版继续作为本地开发入口

## 1. 目标

把当前“客户端选择昵称并通过 `x-member-id` 声明身份”的临时方案，替换为基于微信 openid 的真实登录绑定：

- 主厨首次绑定必须输入主厨口令。
- 家人首次绑定必须输入家庭邀请码。
- 绑定完成后，后续打开小程序自动登录，不再选择身份。
- 服务端根据登录会话判断成员身份和主厨权限。
- 点菜记录使用服务端确认的成员姓名，客户端不能伪造提交人。
- 系统只允许已绑定成员访问业务数据。
- 完成腾讯云、域名、HTTPS 和微信后台配置，使小程序可以正式发布。

## 2. 非目标

本期不实现以下内容：

- 多家庭、多租户或家庭成员管理后台。
- 微信头像、昵称、手机号授权。
- 网页端微信扫码登录。
- 角色在线转移或成员解绑管理界面。
- 支付、订阅消息、分享和消息推送。
- 多台应用服务器或数据库集群。

如果主厨需要更换绑定的微信账号，使用服务端维护命令清除该成员的 openid 和历史会话，然后重新执行首次绑定。

## 3. 关键约束

### 3.1 微信平台约束

- 小程序正式版只能请求已配置的 HTTPS 服务器域名。
- 请求域名必须经过 ICP 备案。
- 正式环境必须关闭“不校验合法域名、TLS 版本以及 HTTPS 证书”。
- HTTPS 证书必须有效，域名必须与证书一致，TLS 版本必须支持 1.2 及以上。
- 小程序不能调用 `api.weixin.qq.com`；AppSecret 只能保存在后端。

### 3.2 安全约束

- 禁止在正式环境信任客户端提交的 `x-member-id`。
- 禁止把 AppSecret、`session_key` 或邀请码写入小程序包。
- 服务端只保存登录 token 的哈希，不保存 token 明文。
- 主厨权限只由服务端会话成员的角色决定。
- 点菜提交人和操作人只由服务端会话确定，忽略客户端提供的同名参数。
- 微信登录 code 只能使用一次；绑定失败后必须重新调用 `wx.login()` 获取新 code。
- 两个成员槽位都已绑定后，其他 openid 不得创建新成员。

## 4. 推荐方案

### 4.1 登录态选型

采用服务端不透明会话 token：

1. 小程序调用 `wx.login()` 获取一次性 code。
2. 后端使用 AppID、AppSecret 和 code 调用微信 `jscode2session`。
3. 后端取得 openid，并在成员表中查找绑定关系。
4. 已绑定成员获得随机 token；数据库中只保存 token 的 SHA-256 哈希。
5. 小程序后续请求携带 `Authorization: Bearer <token>`。
6. 会话固定有效 30 天；失效后小程序自动重新执行微信登录。

不采用 JWT。该应用只有两名成员，数据库会话更容易撤销、审计和排错，也不需要额外依赖。

### 4.2 成员槽位

继续使用现有两个成员槽位：

| 槽位 ID | 角色 | 首次绑定凭证 |
|---|---|---|
| `member-chef` | `chef` | `CHEF_BIND_CODE` |
| `member-family` | `member` | `FAMILY_INVITE_CODE` |

首次绑定时允许填写显示名。显示名写入成员记录，之后点菜、库存操作和日志归属都使用该名称。

每个槽位只能绑定一个 openid。两个槽位都绑定后，后端拒绝任何新的未知 openid 进入。

### 4.3 绑定流程

```text
小程序启动
  -> wx.login()
  -> POST /auth/wechat { code }
      -> 已绑定：返回 token 和 member
      -> 未绑定：返回 needs_binding
  -> 未绑定用户进入绑定页
      -> 选择主厨或家人
      -> 输入显示名和对应口令
      -> 再次 wx.login()
      -> POST /auth/bind { code, kind, inviteCode, displayName }
      -> 校验 code、openid、槽位状态和口令
      -> 写入 openid 和显示名
      -> 签发 token
  -> 进入首页
```

主厨口令和家庭邀请码只在首次绑定页输入，不用于日常登录。

### 4.4 日常登录流程

```text
小程序启动或收到 401
  -> 清除旧 token
  -> wx.login()
  -> POST /auth/wechat { code }
  -> 已绑定：获得新 token
  -> 未绑定：进入绑定页
```

`wx.login()` 返回一次性 code，由后端用 code 换取 openid；这个过程不需要弹用户资料授权，因此不申请头像、昵称或手机号。

## 5. 数据模型

### 5.1 family_member

保留现有字段，并增加绑定约束：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT | 主键 |
| name | TEXT | 显示名，首次绑定时可更新 |
| role | TEXT | `chef` 或 `member` |
| color | TEXT | UI 标签颜色 |
| openid | TEXT NULL | 微信 openid |
| bound_at | TEXT NULL | 首次绑定时间 |
| created_at | TEXT | 创建时间 |

数据库增加部分唯一索引：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_family_member_openid
ON family_member(openid)
WHERE openid IS NOT NULL;
```

### 5.2 auth_session

新增会话表：

| 字段 | 类型 | 说明 |
|---|---|---|
| token_hash | TEXT PRIMARY KEY | token 的 SHA-256 十六进制值 |
| member_id | TEXT NOT NULL | 关联 `family_member.id` |
| created_at | TEXT NOT NULL | 签发时间 |
| expires_at | TEXT NOT NULL | 到期时间 |
| last_seen_at | TEXT NOT NULL | 最近一次有效请求时间 |

外键规则：

```sql
FOREIGN KEY(member_id) REFERENCES family_member(id) ON DELETE CASCADE
```

建议索引：

```sql
CREATE INDEX IF NOT EXISTS idx_auth_session_member
ON auth_session(member_id);

CREATE INDEX IF NOT EXISTS idx_auth_session_expires
ON auth_session(expires_at);
```

过期会话在登录和鉴权时清理，不要求后台定时任务。

### 5.3 meal_item_submission

现有 `meal_item` 对同一顿饭和同一道菜只保留一行，适合展示合并后的菜品，但不能完整保留“两位成员分别点了同一道菜”的提交人信息。新增提交审计表，不改变现有合并和备菜算法：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 主键 |
| meal_id | TEXT NOT NULL | 饭局 |
| recipe_version_id | TEXT NOT NULL | 菜品版本 |
| member_id | TEXT NOT NULL | 提交成员 |
| member_name_snapshot | TEXT NOT NULL | 提交时的成员显示名 |
| quantity | INTEGER NOT NULL | 该成员提交的份数 |
| note | TEXT NOT NULL | 该成员的备注 |
| submitted_at | TEXT NOT NULL | 最近一次提交时间 |

唯一约束：

```sql
UNIQUE(meal_id, recipe_version_id, member_id)
```

点菜时同时执行：

1. 按现有规则 upsert `meal_item`，继续作为菜品聚合行。
2. 按 `meal_id + recipe_version_id + member_id` upsert `meal_item_submission`。
3. 两项写入放在同一事务中。
4. `meal_item.submitter` 保留最近提交人，完整归属从提交审计表读取。

这样既不破坏现有备菜合并算法，也能在饭局详情中展示每位成员分别点了什么。

### 5.4 数据迁移

数据库启动时执行幂等迁移：

1. 为 `family_member` 补充 `bound_at` 字段。
2. 创建 `idx_family_member_openid`。
3. 创建 `auth_session` 表及索引。
4. 创建 `meal_item_submission` 表及唯一索引。
5. 不删除、不重置现有菜谱、饭局、库存和日志数据。
6. 迁移过程放在启动阶段，可重复执行。

## 6. 后端设计

### 6.1 配置

生产环境使用以下环境变量：

```env
NODE_ENV=production
AUTH_MODE=wechat
WX_APPID=小程序AppID
WX_SECRET=小程序AppSecret
CHEF_BIND_CODE=主厨首次绑定口令
FAMILY_INVITE_CODE=家人首次绑定口令
SESSION_TTL_DAYS=30
```

规则：

- `WX_APPID`、`WX_SECRET`、`CHEF_BIND_CODE`、`FAMILY_INVITE_CODE` 缺失时，`AUTH_MODE=wechat` 的正式环境拒绝启动。
- 两个绑定口令至少 12 个字符，并在首次绑定完成后轮换。
- 显示名去除首尾空格后长度为 1 到 20 个字符。
- 绑定口令只保存在服务端环境变量或密钥文件中。
- `AUTH_MODE=legacy` 仅允许本地网页版开发使用；`NODE_ENV=production` 时禁止启用。

### 6.2 微信登录客户端

新增独立模块负责调用微信：

- 请求地址：`https://api.weixin.qq.com/sns/jscode2session`
- 请求参数：AppID、AppSecret、code、`grant_type=authorization_code`
- 超时：5 秒
- 成功：读取 `openid`，丢弃 `session_key`
- 失败：保留微信 `errcode` 和 `errmsg` 供服务端日志使用，不向客户端暴露 AppSecret

微信接口不稳定性、超时和错误码统一转换为 `WECHAT_LOGIN_FAILED`，客户端提示稍后重试。

### 6.3 鉴权中间件

新增统一鉴权函数：

1. 从 `Authorization: Bearer <token>` 读取 token。
2. 计算 SHA-256 哈希。
3. 查询未过期的 `auth_session`。
4. 加载关联成员。
5. 将 `req.member` 和 `req.session` 注入请求上下文。
6. 更新 `last_seen_at`。
7. 缺失、过期或无效 token 返回 `401 UNAUTHORIZED`。

业务接口通过 `requireAuth(req)` 获取成员，通过 `guardChef(req.member)` 判断主厨权限。

旧的 `x-member-id` 在 `AUTH_MODE=wechat` 下完全忽略。

CORS 响应和预检请求允许 `Authorization` 请求头。

### 6.4 身份归属

以下字段必须由服务端会话覆盖：

- 开饭：`meal.created_by = req.member.name`
- 点菜：`meal_item.submitter = req.member.name`
- 库存批量录入：`operator = req.member.name`
- 库存增减和盘点：`operator = req.member.name`
- 需要记录操作人的日志：使用 `req.member.name`

客户端传入的 `created_by`、`submitter`、`operator` 不得覆盖服务端值。

成员接口统一序列化，只返回：

- `id`
- `name`
- `role`
- `color`

不得把 `openid`、`bound_at`、token 哈希或其他会话字段返回给客户端。

### 6.5 绑定记录写入

`POST /auth/bind` 使用事务完成：

1. 调用微信接口取得 openid。
2. 检查 openid 是否已经绑定。
3. 检查目标槽位是否已经绑定。
4. 检查对应口令。
5. 更新目标成员的 `openid`、`name`、`bound_at`。
6. 创建会话并返回 token。

检查与更新必须在同一 SQLite 事务内完成，防止两个请求同时占用同一槽位。

`POST /meals/:id/items` 同时写入聚合菜品行和成员提交审计行。提交审计行的 `member_id` 和 `member_name_snapshot` 只能取当前会话成员。

### 6.6 口令校验与限流

- 先将输入口令和配置口令计算定长 SHA-256，再使用定时安全比较。
- 首次绑定失败按 IP 和 openid 限制：15 分钟内最多 5 次。
- 超过限制返回 `429 TOO_MANY_ATTEMPTS`。
- 登录 code 失效返回 `401 INVALID_LOGIN_CODE`，客户端重新获取 code。
- 失败日志不记录口令明文。

## 7. API 契约

### 7.1 POST /auth/wechat

请求：

```json
{
  "code": "wx.login 返回的一次性 code"
}
```

已绑定响应：

```json
{
  "ok": true,
  "data": {
    "status": "bound",
    "token": "随机token明文，仅本次响应返回",
    "expiresAt": "2026-12-04T08:00:00.000Z",
    "member": {
      "id": "member-chef",
      "name": "爸爸",
      "role": "chef",
      "color": "#D96A3B"
    }
  }
}
```

未绑定响应：

```json
{
  "ok": true,
  "data": {
    "status": "needs_binding"
  }
}
```

### 7.2 POST /auth/bind

请求：

```json
{
  "code": "重新获取的一次性 code",
  "kind": "chef",
  "inviteCode": "主厨口令",
  "displayName": "爸爸"
}
```

`kind` 只能是 `chef` 或 `family`。成功响应与 `/auth/wechat` 的已绑定响应一致。

错误码：

| HTTP 状态 | 错误码 | 含义 |
|---|---|---|
| 400 | `INVALID_DISPLAY_NAME` | 显示名为空或过长 |
| 401 | `INVALID_LOGIN_CODE` | code 无效、过期或已使用 |
| 403 | `INVALID_INVITE_CODE` | 绑定口令错误 |
| 409 | `MEMBER_ALREADY_BOUND` | 槽位已被其他 openid 绑定 |
| 409 | `OPENID_ALREADY_BOUND` | 当前 openid 已绑定其他成员 |
| 429 | `TOO_MANY_ATTEMPTS` | 绑定失败次数过多 |

### 7.3 GET /auth/me

需要 Bearer token，返回当前成员和会话到期时间。

### 7.4 POST /auth/logout

需要 Bearer token，删除当前会话。注销后小程序清除本地 token。

### 7.5 业务接口

所有 `/meals`、`/recipes`、`/inventory`、`/members`、`/calendar` 请求在 `AUTH_MODE=wechat` 下都需要有效 Bearer token。

主厨权限规则：

| 操作 | 主厨 | 家人 |
|---|---:|---:|
| 查看菜品、备菜、库存、日志 | 是 | 是 |
| 点菜 | 是 | 是 |
| 开饭、关饭、删除饭局 | 是 | 否 |
| 新建、编辑、另存、删除菜谱 | 是 | 否 |
| 库存新增、修改、删除、批量录入 | 是 | 否 |
| 勾选备菜完成 | 是 | 否 |

`/members` 在正式模式下只用于读取已绑定成员，不再允许通过昵称创建新成员。

`GET /meals/:id` 返回 `submissions`，用于展示每位成员对同一道菜的提交记录。该字段只包含成员显示名快照、份数、备注和提交时间，不包含 openid。

## 8. 小程序设计

### 8.1 请求层

`src/utils/index.js` 调整为：

- 启动时确保 token 存在。
- 请求统一携带 `Authorization`。
- 收到 401 时清除 token，重新执行一次微信登录。
- 重试只允许一次，避免无限循环。
- 403 时直接展示服务端错误，不触发重新登录。
- 生产地址使用 `https://api.<域名>`，开发环境可继续使用局域网地址。

### 8.2 登录状态管理

新增轻量登录模块，负责：

- `wx.login()`
- 调用 `/auth/wechat`
- 判断 `bound` 或 `needs_binding`
- 保存 token 和 member
- 清除本地登录状态
- 提供 `ensureLogin()` 给页面调用

token 和小程序侧 member 缓存在 `uni.setStorageSync` 中。页面不得自行拼接成员 ID。

### 8.3 绑定页面

新增 `pages/bind/bind.vue`：

- 标题：加入这个家
- 角色选项：主厨 / 家人
- 输入项：显示名、对应绑定口令
- 按钮：绑定并进入
- 说明：口令只在第一次绑定使用
- 错误展示：口令错误、槽位已占用、网络失败
- 绑定成功后使用 `uni.switchTab` 进入首页

绑定页面不显示微信头像、昵称或手机号授权。

### 8.4 首页

- 删除“你是谁？”身份选择卡。
- 删除身份切换入口。
- 首次启动显示登录加载状态。
- 未绑定时跳转绑定页。
- 已绑定时显示“问候语 + 显示名 + 角色标签”。
- 主厨操作按钮继续根据服务端返回角色显示。

### 8.5 小程序配置

- `manifest.json` 填入正式 AppID。
- 正式构建关闭 `urlCheck: false`，改为校验合法域名。
- 请求地址不再写死局域网 IP。
- 开发环境地址与生产地址通过构建环境变量区分。

## 9. 部署设计

### 9.1 腾讯云镜像

推荐购买腾讯云轻量应用服务器：

| 项目 | 选择 |
|---|---|
| 镜像类型 | 系统镜像 |
| 操作系统 | Ubuntu Server 24.04 LTS 64 位 |
| 备选 | Ubuntu Server 22.04 LTS 64 位 |
| 配置 | 2 核 2 GB 内存 |
| 系统盘 | 40 GB SSD 或以上 |
| 地域 | 离家庭所在地近的中国大陆地域 |

不使用宝塔、LAMP、WordPress 等应用镜像。应用容器使用官方 `node:24-bookworm-slim` 镜像。

### 9.2 网络与域名

1. 域名添加 A 记录，指向轻量服务器公网 IP。
2. 在腾讯云提交 ICP 备案。
3. 备案完成前可继续开发和使用开发者工具调试，但不能完成正式发布。
4. 防火墙只开放 80、443 和受限来源的 SSH。
5. 应用端口 8080 不直接暴露到公网。

### 9.3 运行拓扑

```text
微信小程序
  -> HTTPS 443
  -> Caddy 反向代理
  -> Node 24 容器 :8080
  -> SQLite 持久化目录
```

使用 Docker Compose 管理：

| 服务 | 镜像 | 职责 |
|---|---|---|
| app | `node:24-bookworm-slim` | 运行后端 |
| caddy | 官方 Caddy 镜像 | HTTPS、证书续期、反向代理 |

Caddy 只代理 `app:8080`，自动申请和续期 HTTPS 证书。

### 9.4 持久化与备份

- SQLite 数据目录挂载到宿主机持久化目录。
- 容器设置 `restart: unless-stopped`。
- 日志输出到 Docker 日志，不写入容器临时目录。
- 每日执行一次一致性 SQLite 备份，保留最近 30 天。
- 备份使用 SQLite 一致性快照能力，不在 WAL 活跃时直接复制主数据库文件。
- 上线前执行一次恢复演练，确认备份可以打开并读取成员、菜谱和饭局数据。

### 9.5 健康检查

新增 `GET /health`，无需登录，只返回服务进程和数据库可用状态，不返回成员、配置或微信信息。

## 10. 微信后台配置

1. 在微信公众平台获取正式 AppID 和 AppSecret。
2. 在“开发设置 → 服务器域名”配置请求域名：

```text
https://api.<正式域名>
```

3. 域名不能配置为 `api.weixin.qq.com`。
4. 不配置端口或路径，使用标准 HTTPS 443。
5. 小程序上传体验版后，在关闭域名校验的真机上完整测试。
6. 填写用户隐私保护指引，明确 openid 用于家庭内身份识别和操作记录。
7. 提交审核并发布。

## 11. 安全与异常处理

| 场景 | 处理 |
|---|---|
| 未登录访问业务接口 | 返回 401，客户端自动微信登录 |
| token 过期 | 清除本地 token，重新微信登录 |
| token 被撤销 | 返回 401，客户端重新登录 |
| 未知 openid 且槽位已满 | 返回“家庭成员已绑定完成”，不创建成员 |
| 绑定口令错误 | 返回 403，不泄露正确口令或槽位细节 |
| 两个请求同时绑定同一槽位 | 事务和唯一索引保证只有一个成功 |
| 微信接口超时 | 返回可重试错误，不签发 token |
| AppSecret 泄露 | 在微信后台重置 AppSecret，更新服务器环境变量并重启 |
| 绑定口令泄露 | 轮换环境变量；已绑定的 openid 不受影响 |
| 数据库文件损坏 | 从最近一致性备份恢复，并重新配置服务器环境变量 |

服务端日志不得记录：

- AppSecret
- 微信 `session_key`
- 登录 token 明文
- 主厨口令和家庭邀请码

## 12. 测试策略

### 12.1 单元测试

- 两种绑定口令分别只能绑定对应角色。
- 校验口令使用定时安全比较。
- token 生成、哈希和过期判断。
- 会话无效、过期和撤销。
- 主厨与家人的权限矩阵。
- 显示名校验。

### 12.2 集成测试

使用可替换的微信登录客户端，避免测试访问真实微信接口：

1. 新 openid 首次登录返回 `needs_binding`。
2. 正确主厨口令绑定 `member-chef`。
3. 错误主厨口令不能绑定。
4. 正确家人邀请码绑定 `member-family`。
5. 已绑定 openid 再次登录直接返回 token。
6. 槽位被占用时其他 openid 绑定失败。
7. 两个成员的显示名和角色正确写入。
8. 主厨可以开饭，家人不能开饭。
9. 家人可以点菜，`submitter` 等于服务端成员名。
10. 客户端伪造 `x-member-id`、`submitter` 或 `operator` 不生效。
11. 过期 token 返回 401。
12. 注销后 token 立即失效。
13. 第 6 次错误绑定请求被限流。
14. `/health` 不需要登录。
15. 两位成员分别点同一道菜时，聚合菜品仍只有一行，但提交审计表保留两条成员记录。
16. 成员接口响应中不包含 openid 或 token 信息。

### 12.3 真机验收

- 使用两个不同微信账号分别完成主厨和家人绑定。
- 第三个微信账号无法进入。
- 主厨可以完成开饭、备菜、库存和菜谱管理。
- 家人只能查看和点菜。
- 关闭开发者工具的“跳过域名校验”后仍可访问。
- 手机切换网络后自动登录正常。
- 删除小程序缓存后能通过 openid 恢复登录。
- 30 天会话过期后自动重新登录。
- 备份恢复后菜品、库存和日志数据完整。

## 13. 验收标准

满足以下条件才视为本阶段完成：

1. 正式环境所有业务接口都不信任客户端身份头。
2. 两个固定成员槽位分别由正确凭证完成绑定。
3. 未绑定和第三个微信账号无法访问业务数据。
4. 点菜和库存操作使用真实绑定成员姓名。
5. 两位成员分别点同一道菜时，可以查询到各自的提交记录。
6. 小程序启动、token 失效和重新登录流程无需用户手动选身份。
7. AppSecret 和小程序包完全分离。
8. HTTPS 域名通过微信合法域名检查和真机测试。
9. 自动化测试全部通过。
10. SQLite 备份与恢复演练通过。
11. 微信体验版完成主厨、家人双账号联调后提交审核。

## 14. 实施顺序

1. 先完成数据库迁移、微信登录客户端和会话鉴权测试。
2. 再替换业务接口身份来源，并增加权限矩阵测试。
3. 然后完成小程序自动登录、绑定页和 401 重试。
4. 同时准备腾讯云服务器、域名解析和 ICP 备案。
5. 备案完成后部署 HTTPS 服务并配置微信服务器域名。
6. 使用两个真实微信账号完成体验版验收。
7. 提交审核并发布正式版。
