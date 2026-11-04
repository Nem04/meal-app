# 家庭点菜 · 微信小程序（uni-app）第一步实施计划

> 日期：2026-11-04 | 阶段：开发版/体验版跑通，不涉及域名备案与正式上线

## 目标
把现有网页版核心链路，用 uni-app（Vue3 + Vite）重写成微信小程序，先在本机「微信开发者工具 + 测试号」里跑通，家里同 WiFi 真机也可调试。

## 环境结论
- Node v24.22.1（自带）、pnpm 11.x、npm 在 node 安装目录内。
- 微信开发者工具：D:\WechatDevelopment\微信web开发者工具\（含 cli.bat）。
- npm 官方源与 npmmirror 均可达。

## 明确「本阶段不做」
- 不买域名、不备案、不配 HTTPS、不上云（第二步再做）。
- 微信 openid 真实登录、绑定与正式上线已纳入 [openid 登录绑定与正式上线设计](superpowers/specs/2026-11-04-wechat-openid-auth-deploy-design.md) 和 [实施计划](superpowers/plans/2026-11-04-wechat-openid-auth-deploy.md)。
- 不做支付、分享、订阅消息。

## 技术路线
- uni-app 官方 CLI 项目 `@dcloudio/uvm` 或 create-uni 模板（Vue3 + Vite + TypeScript/JS）。
- 复用现有后端 REST API（`/api/meals`、`/recipes`、`/inventory`、`/members`、`/calendar`）。
- 小程序内用 `wx.login` 获取一次性 code；服务端换取 openid 后，首次进入按主厨或家人角色输入显示名及对应绑定口令，之后自动登录。

## 目录约定
```
meal-app/
  miniprogram/        # uni-app 项目（新增）
  backend/            # 现有后端，不变
```

## 接口地址约定（开发版）
- 小程序 developer tools 里开启「不校验合法域名」。
- H5/开发版 baseURL 指向 `http://192.168.5.2:8080`（局域网）或 `http://localhost:8080`。

## 任务拆分
1. 创建 uni-app 项目骨架，跑通 Hello 页面。
2. 搭建基础请求层 + 身份选择（成员）。
3. 移植「今天吃啥 / 点菜 / 备菜」主链路。
4. 移植「菜谱（含 fork 自家版）」「库存（含批量录入/删除）」「日志月历」。
5. 底部 Tab 与视觉统一（沿用橄榄绿/番茄红/奶油纸风格）。
6. 微信开发者工具真机预览 + 局域网联调文档。
