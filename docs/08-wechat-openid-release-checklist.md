# 微信小程序上线检查清单

## 腾讯云和域名
- [ ] 轻量应用服务器为 Ubuntu Server 24.04 LTS 64 位。
- [ ] 24.04 LTS 不可用时，轻量应用服务器使用 Ubuntu Server 22.04 LTS 64 位。
- [ ] 服务器地域在中国大陆，公网 IP 已绑定域名 A 记录。
- [ ] ICP 备案已通过。
- [ ] 防火墙只开放 80、443 和受限来源 SSH。
- [ ] Caddy 已签发有效 HTTPS 证书。
- [ ] HTTPS 已通过 TLS 1.2 或更高版本验证，TLS 1.0 和 1.1 已禁用。

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
- [ ] 备份脚本使用 SQLite 一致性快照（`VACUUM INTO`），未直接复制 WAL 活跃状态下的主数据库文件。
- [ ] 备份文件可以打开并读到成员、菜谱和饭局数据。
- [ ] 已在测试或预发布环境完成一次备份恢复演练，恢复后可读写成员、菜谱和饭局数据。
- [ ] 应用和 Caddy 日志中未出现 `WX_SECRET`、`session_key`、token 明文、`CHEF_BIND_CODE` 或 `FAMILY_INVITE_CODE`。
- [ ] 关闭开发者工具域名跳过后真机可访问。
- [ ] 体验版双账号联调完成。
- [ ] 已提交审核并发布正式版。
