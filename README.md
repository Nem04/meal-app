# 家庭点菜小程序（家庭版微信菜单点菜）

> 家庭内部 2 人使用，第一阶段做手机网页版，保留套壳微信小程序的可能。

## 文档导航

| 文档 | 内容 |
|------|------|
| `docs/01-product-form.md` | 产品形态与功能规划 |
| `docs/02-requirements.md` | 需求开发文档（PRD） |
| `docs/03-ui-style.md` | UI 风格设计 |
| `docs/04-backend-architecture.md` | 后端架构与数据设计 |
| `docs/05-dev-plan.md` | 实施开发计划 |

## 核心红线（一句话记住）

- 食材按「规范名称 + 单位」合并去重，不做隐式单位换算。
- **勾选「备齐」只改状态，永不扣库存**；库存变化只来自手动加/减/盘点。
- 库存不推断保质期；菜谱「另存为我家版」是 copy-on-write，不影响原版。

## 当前状态

- [x] 产品形态
- [x] 需求文档
- [x] UI 风格
- [x] 后端架构
- [x] 开发计划
- [ ] 代码实施（待确认方案后从 M0 开始）

## 目录结构（规划）

```
meal-app/
  backend/    # Node + TS + SQLite
  frontend/   # Vue/React 移动端 SPA
  docs/       # 产品与设计文档
  data/       # sqlite 数据与备份
```

