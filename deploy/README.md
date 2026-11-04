# 腾讯云部署

> **部署前必须替换占位值**：`DOMAIN` 需替换为已完成 ICP 备案并解析到腾讯云的真实域名；`miniprogram/src/manifest.json` 与 `deploy/.env.production` 中的 AppID 需替换为真实小程序 AppID；`deploy/.env.production` 中的 `WX_SECRET` 需替换为真实密钥；`CHEF_BIND_CODE` 与 `FAMILY_INVITE_CODE` 需替换为各至少 12 个字符的随机口令。`WX_SECRET` 只能写入服务器上被 `.gitignore` 忽略的 `deploy/.env.production`，严禁提交到 Git 或放入 Caddy 容器。

## 部署前：开通防火墙 / 安全组

腾讯云默认关闭 80/443，必须先放行，否则 Caddy 自动 HTTPS 与微信请求不可达：

1. 在轻量应用服务器控制台「防火墙」页面新增规则，放行入站 TCP 80（用于 Caddy 自动签发 HTTPS 证书）。
2. 放行入站 TCP 443（HTTPS 服务，微信 request 合法域名请求）。
3. SSH（TCP 22）仅允许运维人员自己的公网 IP（将来源 IP 限制为该 IP）。
4. 实例详情中如配置了「安全组」，同样放行入站 TCP 80/443，并按需限制 SSH 来源。

## 部署步骤

1. 腾讯云轻量应用服务器选择系统镜像 Ubuntu Server 24.04 LTS 64 位，2 核 2G、40GB SSD；若 24.04 不可用，使用 Ubuntu Server 22.04 LTS。
2. 安装 Docker Engine 和 Docker Compose 插件。
3. 域名 A 记录指向服务器公网 IP，完成 ICP 备案。
4. 将仓库部署到服务器，在 deploy/.env.production 中填写真实环境变量。
5. 执行 `docker compose --env-file deploy/.env.production up -d --build`。
6. 执行 `curl https://$DOMAIN/health`，预期返回 `{"ok":true,"data":{"status":"ok"}}`。
7. 在微信公众平台开发设置中把 `https://$DOMAIN` 配置为 request 合法域名。
8. 每日执行 `docker compose --env-file deploy/.env.production exec app node scripts/backup.js`。
9. 回滚时在部署记录中找到上一个提交哈希，执行 `git switch <COMMIT_HASH>`，再执行 `docker compose --env-file deploy/.env.production up -d --build`。

## 回滚注意

如果代码回滚跨越了数据库 schema 迁移（例如新增字段或表），仅执行 `git switch <COMMIT_HASH>` 后重建容器可能导致旧代码与已迁移的数据库不兼容；此时应先从 `data/backups/` 恢复与目标提交匹配的 SQLite 快照，再重新部署。回滚前建议先执行 `docker compose --env-file deploy/.env.production exec app node scripts/backup.js` 留存当前快照。
