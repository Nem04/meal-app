# 微信开发者工具导入与真机预览指引

> 本阶段（第一步）：用「测试号 / 游客模式」在微信开发者工具里跑通，不涉及域名备案。

## 一、导入项目

1. 打开**微信开发者工具**（快捷方式或 `D:\WechatDevelopment\微信web开发者工具\微信开发者工具.exe`）。
2. 用**微信扫码登录**。
3. 选择「**导入项目**」，目录选择：
   ```
   D:\NemoFile\meal-app\miniprogram\dist\build\mp-weixin
   ```
4. AppID：
   - 有自己小程序：填你的 AppID；
   - 临时体验：选「**测试号**」或「**游客模式**」即可。
5. 点「导入」即可运行。

## 二、关键设置（真机预览必做）

因为当前后端是局域网 `http://192.168.5.2:8080`，需关闭域名校验：

1. 微信开发者工具右上角「**详情**」→「**本地设置**」；
2. 勾选「**不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**」。

> 这一步在 `manifest.json` 的 `mp-weixin.setting.urlCheck: false` 已预设，通常导入即生效；如仍拦截，手动勾选一次。

## 三、真机预览

1. 手机和电脑连**同一个 WiFi**。
2. 修改 `miniprogram/src/utils/index.js` 第一行：
   ```js
   export const BASE_URL = 'http://localhost:8080';
   ```
   改成电脑的局域网地址：
   ```js
   export const BASE_URL = 'http://192.168.5.2:8080';
   ```
3. 在命令行重新编译到微信小程序：
   ```powershell
   cd D:\NemoFile\meal-app\miniprogram
   & 'C:\Program Files\nodejs\npm.cmd' run build:mp-weixin
   ```
4. 回到微信开发者工具，点「**预览**」，手机微信扫码即可真机运行。

## 四、重新编译命令备忘

```
npm run dev:mp-weixin   # 开发模式（热更新）
npm run build:mp-weixin # 生产构建（会自动生成 dist/build/mp-weixin）
```

> 注意：本机测试 `npm` 不在 PATH 里，请用完整路径
> `C:\Program Files\nodejs\npm.cmd`，或先执行
> `$env:Path += ";C:\Program Files\nodejs"`。

## 正式环境

- 使用正式 AppID，不要把 AppSecret 写入小程序。
- request 合法域名必须是 `https://api.<域名>`。
- 正式构建必须设置 `urlCheck: true`。
- 首次进入按角色输入主厨口令或家庭邀请码。

## 五、接下来（第二步，可选再做）

- 购买域名 → 备案 → 上云服务器 → 配 HTTPS → 微信后台绑定合法域名 → 插入 AppID → 提交审核正式发布。
