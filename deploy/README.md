# 腾讯云部署

1. 腾讯云轻量应用服务器选择系统镜像 Ubuntu Server 24.04 LTS 64 位，2 核 2G、40GB SSD。
2. 安装 Docker Engine 和 Docker Compose 插件。
3. 域名 A 记录指向服务器公网 IP，完成 ICP 备案。
4. 将仓库部署到服务器，在 deploy/.env.production 中填写真实环境变量。
5. 执行 `docker compose --env-file deploy/.env.production up -d --build`。
6. 执行 `curl https://$DOMAIN/health`，预期返回 `{"ok":true,"data":{"status":"ok"}}`。
7. 在微信公众平台开发设置中把 `https://$DOMAIN` 配置为 request 合法域名。
8. 每日执行 `docker compose --env-file deploy/.env.production exec app node scripts/backup.js`。
9. 回滚时在部署记录中找到上一个提交哈希，执行 `git switch <COMMIT_HASH>`，再执行 `docker compose --env-file deploy/.env.production up -d --build`。
