# 微信小程序上线检查清单

## 腾讯云和域名
- [ ] 轻量应用服务器为 Ubuntu Server 24.04 LTS 64 位。
- [ ] 24.04 LTS 不可用时，轻量应用服务器使用 Ubuntu Server 22.04 LTS 64 位。
- [ ] 服务器地域在中国大陆，公网 IP 已绑定域名 A 记录。
- [ ] ICP 备案已通过。
- [ ] `DOMAIN` 已替换为真实域名，不是 `api.example.com` 或其它占位值。
- [ ] 防火墙只开放 80、443 和受限来源 SSH。
- [ ] Caddy 已签发有效 HTTPS 证书。
- [ ] HTTPS 已通过 TLS 1.2 或更高版本验证，TLS 1.0 和 1.1 已禁用。

## 后端环境
- [ ] `NODE_ENV=production`。
- [ ] `AUTH_MODE=wechat`。
- [ ] `WX_APPID` 和小程序后台一致。
- [ ] `WX_APPID` 和 `WX_SECRET` 不为空，且不以 `replace-with-` 开头。
- [ ] `WX_SECRET` 只存在服务器，未进入 Git 和小程序包。
- [ ] `CHEF_BIND_CODE` 和 `FAMILY_INVITE_CODE` 均至少 12 个字符。
- [ ] `CHEF_BIND_CODE` 和 `FAMILY_INVITE_CODE` 不为空，且不以 `replace-with-` 开头；否则后端拒绝启动。
- [ ] 两个绑定口令已保存在密码管理器。

## 微信后台
- [ ] request 合法域名填写 `https://api.<域名>`。
- [ ] 未填写 `api.weixin.qq.com`。
- [ ] 小程序 AppID 已填入 manifest。
- [ ] 小程序生产请求地址（`miniprogram/src/utils/http.js` 的 `PROD_BASE_URL`）已替换为 `https://api.<真实域名>`，不是 `https://api.example.com`。
- [ ] `urlCheck` 已开启。
- [ ] 用户隐私保护指引已填写 openid 用途。

## 多微信验收
- [ ] 主厨微信首次绑定成功。
- [ ] 家人微信首次绑定成功。
- [ ] 未输入任何口令的陌生微信无法进入。
- [ ] 多个微信使用同一个主厨码进入后，均显示主厨角色并可编辑。
- [ ] 多个微信使用同一个家人码进入后，均只可查看和点菜。
- [ ] 同一微信重复进入不会产生重复成员。
- [ ] 三个以上微信分别使用主厨码和家人码联调通过。
- [ ] 多个主厨修改库存后，其他主厨可以看到最新数据。
- [ ] 成员列表只显示已绑定成员，不展示未绑定历史槽位。
- [ ] 旧成员、旧会话、旧饭局、库存、菜谱和日志保持可用。
- [ ] 主厨 A 修改库存后，主厨 B 刷新可以看到最新值。
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
- [ ] 体验版多微信联调完成。
- [ ] 已提交审核并发布正式版。
