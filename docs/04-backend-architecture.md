# 家庭点菜小程序 · 后端架构与数据设计

> 版本：v1.0（草案） | 日期：2026-11-02
> 技术取向：单机可部署、易维护、为套壳微信小程序预留 API 边界。

## 1. 总体架构

```
┌───────────────── 手机端 / 桌面端 ─────────────────┐
│  网页版 PWA（Vue/React 单页应用，移动端优先）        │
│  （未来可替换为微信小程序壳，调用同一套 HTTP API）    │
└────────────────────────┬───────────────────────────┘
                         │ HTTP/JSON (REST)
┌────────────────────────▼───────────────────────────┐
│              应用后端（单体，Node.js）           │
│  ┌──────────┐ ┌──────────┐ ┌────────────────────┐  │
│  │ 路由/控制器│→│  服务层   │→│ 领域规则（合并去重  │  │
│  │ (HTTP)   │ │  (用例)   │ │  库存红线/解析引擎) │  │
│  └──────────┘ └──────────┘ └────────────────────┘  │
│                          │                          │
│                  ┌───────▼────────┐                 │
│                  │ ORM / Repository │                │
│                  └───────┬────────┘                 │
│                     SQLite（单文件）+ 可选备份        │
└──────────────────────────────────────────────────────┘
```

- **单体优先**：2 人家庭场景，无微服务必要。边界清晰即可，日后可按模块拆分。
- **REST + JSON**：所有读写走标准接口，前端可替换（网页壳 ↔ 小程序壳）。
- **实时性**：V1 用简单轮询（列表每 10–20 秒刷新）或 Server-Sent Events（SSE）；暂不引入 WebSocket 复杂度。

## 2. 技术栈建议

| 层 | 选型 | 理由 |
|----|------|------|
| 后端 | Node.js + TypeScript + Express / Fastify | 与前端共享 TS 类型，轻量 |
| ORM | Prisma 或 Drizzle + SQLite | 类型安全、迁移清晰 |
| 数据库 | SQLite 单文件 | 单机零运维，备份即拷文件 |
| 前端 | Vue 3 + Vite（或 React + Vite） | 移动端 SPA 生态成熟 |
| PWA | 可离线缓存静态资源 | 弱网/局域网更顺滑 |
| 部署 | 单进程 + systemd / Docker | 家里常开设备睡眠可设置为不休眠 |
| 远程 | Tailscale / Cloudflare Tunnel / frp（可选） | 不改业务逻辑，只在网络层接入 |

## 3. 领域模型（核心实体）

```
Meal（一顿饭） 1 ──── n MealItem（饭局内被点的菜）
                  │
MealItem n ──── 1 RecipeVersion（这道菜当时的快照，用于合并）
                  │
Recipe（菜谱）1 ──── n RecipeVersion（原版/我家版，copy-on-write）
RecipeVersion 1 ──── n IngredientSpec（食材规格：名称+数量+单位）
                  │
MealPrepEntry（合并后的备菜条目） n ──── 1 Meal
                  │   （仅存状态：prepared、缺额快照，不持库存）
InventoryItem（库存） 独立于 Meal，仅由手动动作变更
MealLog（日志） n ──── 1 Meal
```

关键点：

- **RecipeVersion 快照**：开饭点菜时，菜品挂的是 `recipe_version_id`，避免菜谱日后被改导致历史饭局数据漂移。
- **IngredientSpec**：一份菜谱可多份食材规格，存「原始名、规范名、数量、单位」。
- **MealPrepEntry**：合并结果是「饭局的一次投影/快照」，其 `prepared` 勾选状态与库存表完全分离。

## 4. 数据表设计（逻辑篇）

### 4.1 recipe（菜谱主体）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| name | text | 菜名 |
| category | text | 荤/素/汤/主食/凉菜 |
| source | text | 来源（原创/导入） |
| current_version_id | uuid | 当前生效版本 |
| created_at / updated_at | datetime | 时间戳 |

### 4.2 recipe_version（菜谱版本，copy-on-write）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| recipe_id | uuid | 所属菜谱 |
| fork_of_version_id | uuid nullable | 另存自哪份版本（溯源） |
| title | text | 版本标题（如「我家版·少盐」） |
| steps | text/json | 步骤 |
| is_stock | bool | 是否系统基础版/我家版（只是标记，非权限） |
| created_at | datetime | |

### 4.3 ingredient_spec（菜谱内食材规格）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | |
| version_id | uuid | 所属菜谱版本 |
| raw_name | text | 原录名称 |
| canonical_name | text | 合并基准（如「葱」） |
| quantity | decimal | 数量 |
| unit | text | 单位（斤/克/个/瓶/根/把/毫升等） |
| note | text | 备注 |

### 4.4 meal（一顿饭）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | |
| title | text | 如「今晚」 |
| meal_date | date | 用餐日 |
| status | enum | open（进行中）/merged/closed |
| created_by | text | 发起人昵称 |
| created_at / closed_at | datetime | |

### 4.5 meal_item（饭局内被点的菜）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | |
| meal_id | uuid | |
| recipe_version_id | uuid | 点菜时版本快照 |
| submitter | text | 提交人 |
| quantity | int | 点的份数（默认1） |
| note | text | 个人备注 |
| submitted_at | datetime | 最近一次提交时间（用于去重） |

- **去重规则**：同一 `meal_id + submitter + recipe_version_id` 重复提交时，更新 `note/quantity/submitted_at` 而不是新增行。

### 4.6 meal_prep_entry（合并后的备菜投影条目）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | |
| meal_id | uuid | |
| canonical_name | text | 合并名 |
| unit | text | 单位 |
| total_quantity | decimal | 汇总需求 |
| available | decimal nullable | 生成时的库存可用量快照 |
| shortage | decimal nullable | 缺额快照 |
| prepared | bool | 是否备齐 |
| prepared_at | datetime | |

- **库存红线**：`prepared` 改变时，服务层禁止调用任何 `InventoryItem` 写操作；此规则写进服务层守卫与单测。

### 4.7 inventory_item（库存）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | |
| canonical_name | text | |
| quantity | decimal | |
| unit | text | |
| note | text | 备注 |
| updated_by / updated_at | | 变更轨迹 |

- **无保质期字段**；变更只来自 `inventory_log` 关联的显式手动动作。

### 4.8 inventory_log（库存变更轨迹）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | |
| item_id | uuid | |
| op | enum | add/subtract/stocktake |
| delta | decimal | 变化量（盘点为绝对值覆盖） |
| note / operator / created_at | | |

### 4.9 meal_log（饭局日志）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | |
| meal_id | uuid | 唯一 |
| sentence | text | 一句话 |
| rating | enum | 好吃/一般/踩雷 |
| created_at / updated_at | | |

## 5. 核心算法设计

### 5.1 食材合并流水线（merge pipeline）

```
输入：某顿饭所有 meal_item 的 ingredient_spec 列表
  ↓
Step 1 规范化名称：raw_name → canonical_name（别名表 + 清洗）
Step 2 单位判别：unit 字符串归一化（1kg→1000g 可选，V1 慎用）
Step 3 分组聚合：group by (canonical_name, unit) 求和 quantity
Step 4 跨单位提示：同 canonical 不同 unit 并排输出「可合并」标记
Step 5 生成 meal_prep_entry 投影 + 对照库存求 shortage
```

- 别名表（示例）：`小葱/香葱/青葱 → 葱`，`盐焗用海盐 → 盐`，`鸡蛋/土鸡蛋 → 鸡蛋`。
- 单位规范化（示例）：`个/只 → 个`，`斤/市斤 → 斤`。**跨体系不做隐式换算**，避免误差。

### 5.2 文本解析引擎（库存粘贴录入）

- 分隔器：按 `，、,；;。\n` 切分。
- 三元组提取：正则识别 `名称 + [数字/中文量词] + 单位`；中文量词映射：`一斤=1斤、半斤=0.5斤、十个=10个、一瓶=1瓶、若干=待确认`。
- 多结果策略：
  - 全解析成功 → 直接预览确认后批量入库。
  - 部分失败 → 成功的直接预览，失败的进入「待确认」框，用户补全。
- **红线**：解析结果必须经用户点「确认」才写入库存；不自动写库。

## 6. API 设计（REST 摘要）

| 方法 | 路径 | 用途 |
|------|------|------|
| GET/POST | `/meals` | 列出 / 新建一顿饭 |
| GET | `/meals/:id` | 饭局详情（含已点菜） |
| POST | `/meals/:id/items` | 点菜/提交（去重语义） |
| GET | `/meals/:id/prep` | 合并清单（触发合并投影） |
| PATCH | `/meals/:id/prep/:entryId` | 勾选备齐（**仅改 prepared**） |
| PATCH | `/meals/:id/close` | 结束饭局 |
| GET/POST | `/recipes` | 菜谱列表 / 新建 |
| GET | `/recipes/:id/versions/:vid` | 菜谱版本详情 |
| POST | `/recipes/:id/versions/:vid/fork` | 另存为我家版 |
| GET/POST | `/inventory` | 库存列表 / 新增 |
| POST | `/inventory/parse` | 文本解析预览（不落库） |
| POST | `/inventory/bulk` | 确认后批量入库 |
| PATCH | `/inventory/:id` | 手动改数量（盘点/出/入写 log） |
| GET/POST | `/meals/:id/log` | 饭局一句话日志 |
| GET | `/calendar?month=2026-11` | 月历聚合 |

- 统一响应：`{ ok, data, error }`；错误码稳定，便于前端套壳复用。

## 7. 关键设计决策（红线落地）

| 决策 | 落地机制 |
|------|----------|
| 备菜勾选不扣库存 | `PATCH /prep/:entryId` 只写 `meal_prep_entry.prepared`，服务层守卫 + 单测断言库存快照不变 |
| 库存不自动扣减 | 库存写路径全部经过 `inventory_log` + 显式 op；无定时任务/无事件监听写库存 |
| 菜谱 fork 隔离 | `recipe_version.fork_of_version_id` 复制数据，编辑副本不触原版 |
| 点菜去重 | `meals/:id/items` 按 `submitter + recipe_version` upsert |
| 合并投影可追溯 | `meal_prep_entry` 保存总额/缺额快照；原菜谱后续修改不影响旧饭局 |

## 8. 部署方案

### 8.1 本地（第一阶段）
- 后端 + 前端构建产物同机运行，SQLite 文件在 `data/app.db`。
- 家里常开设备设为「不休眠」，或接插座定时。
- 局域网访问：`http://<设备IP>:8080`；可打印二维码供家人扫码。

### 8.2 远程（可选）
- 用 Tailscale 组家庭私有网（最省心，点对点加密）。
- 或 Cloudflare Tunnel 暴露为受密码保护的链接。
- **不建议**直接端口映射到公网裸奔；如必须，加家庭口令 + HTTPS。

### 8.3 备份
- 每日/每周自动复制 `app.db` 到备份目录；保留最近 30 份。
- 手动「导出 JSON/CSV」作为二次保险（菜谱与库存）。

## 9. 测试策略

- **单元测试**：解析引擎（文本→三元组）、别名规范化、合并聚合、跨单位提示。
- **红线测试**：
  1. 勾选备齐前后 `SELECT` 库存快照完全一致。
  2. 菜谱 fork 后修改副本，原版不变。
  3. 同人重复点菜不产生重复行。
- **接口测试**：核心 REST 用例。
- **手工验收**：30 秒链路 + 月历回看。

## 10. 目录结构建议

```
meal-app/
  backend/
    src/
      routes/       # HTTP 入口
      services/     # 用例服务层
      domain/       # 合并引擎、解析引擎、别名表
      repositories/ # Prisma/Drizzle 数据访问
      guard/        # 库存写保护守卫
    prisma/ schema.prisma
    tests/
  frontend/
    src/           # Vue 单页应用，pages/components/api
  docs/            # 本文档系列
  data/            # sqlite 数据
```

