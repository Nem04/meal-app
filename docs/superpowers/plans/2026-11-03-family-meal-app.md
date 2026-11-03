# 家庭点菜小程序 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个可在家庭设备上当天运行的「点菜—合并食材—备菜—库存—菜谱—日志/月历」手机网页应用。

**Architecture:** 单机单体。后端 Node.js（ESM）+ 内置 `node:http` + 内置 `node:sqlite`，零 npm 运行时依赖；前端为无构建的静态 SPA（HTML/CSS/JS），由后端静态服务。核心业务（合并去重、文本解析、库存红线、菜谱 fork）下沉为可单测的纯函数/服务。

**Tech Stack:** Node 24 `node:test`（测试）、`node:sqlite`（存储）、原生 `fetch`/`http`（前端到后端），前端原生 JS。

**Spec:** `docs/02-requirements.md`（需求）、`docs/04-backend-architecture.md`（架构）、`docs/03-ui-style.md`（UI）

## Global Constraints

- 合并去重唯一键 = `canonical_name + unit`，不隐式单位换算。
- 勾选「备齐」只写 `meal_prep_entry.prepared`，任何路径不得写库存表（红线 + 单测）。
- 库存写路径必须经 `inventory_log` 的 add/subtract/stocktake，无定时任务自动写库存。
- 菜谱 fork = copy-on-write，编辑副本不影响原版。
- 同 meal + submitter + recipe_version 重复点菜用 upsert，不新增行。
- 前端主按钮触控区 ≥ 48px；移动端单列布局。

---

### Task 1: 数据库与基础服务
- Create: backend/package.json, backend/src/config.js, backend/src/db.js, backend/src/schema.sql, backend/src/util.js
- 产出：`openDb()`（启用外键）、`schema.sql` 9 张表、`uuid()`/json body/响应工具。
- 验证：`node -e "require db open + PRAGMA foreign_keys=1"`。

### Task 2: 领域纯函数（可测核心）
- Create: backend/src/domain/canonical.js, merge.js, parseInventory.js
- 产出：`canonicalName()`, `normalizeUnit()`, `mergeIngredients(items)`, `parseInventoryText(text)`。
- 测试：tests/canonical.test.js, merge.test.js, parseInventory.test.js（node:test），全绿。

### Task 3: 数据访问与用例服务
- Create: backend/src/repo.js, backend/src/services.js
- 产出：实体 CRUD、`regeneratePrep(mealId)`（生成 meal_prep_entry 快照 + 对照库存求缺额）、`setPrepPrepared()`（红线守卫）、`forkRecipeVersion()`、`upsertMealItem()`（去重）、库存 `applyInventoryOp()`（写 log）。
- 测试：tests/services.test.js 覆盖三条红线。

### Task 4: HTTP 路由与静态服务
- Create: backend/src/http.js, backend/src/routes.js, backend/src/server.js
- 产出：REST 接口（meals/recipes/inventory/prep/log/calendar）+ 前端静态文件服务。

### Task 5: 前端 SPA（五模块）
- Create: frontend/public/index.html, styles.css, app.js
- 产出：底部四页签 + 点菜/备菜/库存粘贴录入/菜谱 fork/月历，串完整链路。

### Task 6: 部署与文档收尾
- 启动脚本、局域网访问说明、备份脚本；README 更新；手工验证清单。
