# VPS 安装与维护

以下步骤面向已安装 Docker Engine 与 Docker Compose Plugin 的 Linux VPS。平台不占用 80/443，只绑定环回端口。

## 安装

```bash
sudo mkdir -p /opt/microbio-lab
cd /opt/microbio-lab
# 将 GitHub Release 压缩包下载到此处并校验 SHA256SUMS 后解压
sudo ./scripts/install.sh
cp .env.example .env
openssl rand -hex 32
nano .env
docker compose config
docker compose pull
docker compose up -d
docker compose ps
./scripts/healthcheck.sh
```

`.env` 中至少替换 `GHCR_OWNER`、`POSTGRES_PASSWORD`、`DATABASE_URL`、`SESSION_SECRET`、`PLATFORM_ORIGIN` 和 `EXPERIMENT_ORIGIN`。不要在 URL 密码中直接使用未编码的 `@:/?#` 字符。

若 GHCR Package 为私有：

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

PAT 只授予读取 Package 的最低权限；公开 Package 不需要登录。

## 创建管理员

```bash
docker compose exec app node dist/cli/create-admin.js --email admin@example.com
```

终端会隐藏输入的密码。浏览器访问 `https://lab.example.com/login`。

## 域名与 TLS

```text
lab.example.com     → 127.0.0.1:18080
exp.lab.example.com → 127.0.0.1:18081
```

复制 `docs/nginx-host.example.conf` 到现有宿主机 Nginx 并补充证书配置；也可使用 Caddy、Cloudflare 或 Cloudflare Tunnel。两个 Origin 必须不同，且必须使用 HTTPS。不要把 Docker 服务直接监听到 `0.0.0.0`。

## 日常操作

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f builder
docker compose restart app builder
docker compose down
docker compose up -d
```

停止或升级容器不会删除 `/srv/microbio-lab`。

## 备份、升级与回滚

```bash
./scripts/backup.sh
./scripts/upgrade.sh v1.1.0
./scripts/rollback.sh v1.0.0
```

备份包含 PostgreSQL dump、原始 JSX、已发布实验、封面、元数据及 SHA256SUMS。升级前自动备份，应用启动时使用 PostgreSQL advisory lock 串行执行迁移。镜像回滚不自动逆向修改数据库，因此版本迁移应保持向后兼容。

恢复会覆盖当前数据，必须输入明确确认：

```bash
./scripts/restore.sh /srv/microbio-lab/backups/2026-08-16_120000
```

普通卸载只停止容器：

```bash
./scripts/uninstall.sh
```

只有确认已有异机备份并确实要永久清除时才运行 `./scripts/uninstall.sh --purge-data`。
