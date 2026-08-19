# VPS 部署与运维

本文以公开版本 `v1.2.0` 为例，适用于 Ubuntu/Debian VPS。生产环境固定使用不可变的 `vX.Y.Z` 镜像标签，不建议直接使用 `latest`。

平台只监听 VPS 本机：

```text
主平台：http://127.0.0.1:18080
实验站：http://127.0.0.1:18081
```

Compose 文件中的 `:8080` 是容器内部端口，不会占用宿主机 8080。下文命令可由 `root` 直接执行；普通用户需要保留 `sudo`。

## 1. 安装前检查

先查看系统架构、磁盘和已有依赖，不重复安装：

```bash
uname -m
df -h /opt /srv 2>/dev/null || df -h /
docker --version
docker compose version
git --version 2>/dev/null || true
curl --version 2>/dev/null | head -n1 || true
openssl version 2>/dev/null || true
```

建议 Docker Engine 24+、Docker Compose Plugin 2.20+。只补装缺少的基础命令：

```bash
missing=()
command -v git >/dev/null 2>&1 || missing+=(git)
command -v curl >/dev/null 2>&1 || missing+=(curl)
command -v openssl >/dev/null 2>&1 || missing+=(openssl)

if ((${#missing[@]})); then
  sudo apt-get update
  sudo apt-get install -y "${missing[@]}"
fi
```

仅当 `docker compose version` 失败时检查并安装 Compose Plugin：

```bash
apt-cache policy docker-compose-plugin
sudo apt-get update
sudo apt-get install -y docker-compose-plugin
docker compose version
```

## 2. 全新在线安装

仓库和 GHCR 镜像均为公开资源，不需要 GitHub Token 或 `docker login`：

```bash
INSTALL_VERSION="v1.2.0"

sudo install -d -o "$(id -u)" -g "$(id -g)" /opt/microbio-lab
git clone --branch "$INSTALL_VERSION" --depth 1 \
  https://github.com/CodeAIX/MicroBioLab.git \
  /opt/microbio-lab
cd /opt/microbio-lab
sudo ./scripts/install.sh
```

`git clone` 要求目标目录为空；已有部署应使用后面的升级流程。

配置两个 Cloudflare Tunnel 域名并生成随机密钥：

```bash
cd /opt/microbio-lab

PLATFORM_DOMAIN="lab.example.com"
EXPERIMENT_DOMAIN="exp.lab.example.com"
DB_PASSWORD="$(openssl rand -hex 24)"
SESSION_SECRET="$(openssl rand -hex 32)"

cp .env.example .env
chmod 600 .env
sed -i \
  -e 's|^GHCR_OWNER=.*|GHCR_OWNER=codeaix|' \
  -e 's|^PLATFORM_VERSION=.*|PLATFORM_VERSION=v1.2.0|' \
  -e 's|^BUILDER_VERSION=.*|BUILDER_VERSION=v1.2.0|' \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${DB_PASSWORD}|" \
  -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://microbio:${DB_PASSWORD}@db:5432/microbio|" \
  -e "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SECRET}|" \
  -e "s|^PLATFORM_ORIGIN=.*|PLATFORM_ORIGIN=https://${PLATFORM_DOMAIN}|" \
  -e "s|^EXPERIMENT_ORIGIN=.*|EXPERIMENT_ORIGIN=https://${EXPERIMENT_DOMAIN}|" \
  .env
unset DB_PASSWORD SESSION_SECRET

sudo docker compose config --quiet
sudo docker compose pull
sudo docker compose up -d
sudo ./scripts/healthcheck.sh
sudo docker compose ps
```

创建第一个管理员，密码会通过终端交互读取，不会写入 `.env`：

```bash
cd /opt/microbio-lab
sudo docker compose exec app \
  node dist/cli/create-admin.js --email admin@example.com
```

## 3. Cloudflare Tunnel

配置两个不同的 Public Hostname：

```text
lab.example.com      -> HTTP -> 127.0.0.1:18080
exp.lab.example.com  -> HTTP -> 127.0.0.1:18081
```

浏览器访问 `https://lab.example.com/login`。外部使用 HTTPS，Tunnel 到 VPS 本机使用 HTTP。

实验站根路径返回 `404 Not Found` 是正常行为。它只托管 `/e/<slug>/<version>/` 静态实验；学生应从主平台首页、介绍页或二维码进入稳定地址 `/experiments/<slug>/run`。

## 4. 安装或更新公开镜像

匿名拉取指定版本：

```bash
docker pull ghcr.io/codeaix/microbio-lab-app:v1.2.0
docker pull ghcr.io/codeaix/microbio-lab-builder:v1.2.0
```

生产部署应把 `.env` 中两个版本变量设为同一个不可变版本：

```bash
grep -E '^(PLATFORM_VERSION|BUILDER_VERSION)=' /opt/microbio-lab/.env
```

不要只拉取镜像后期待运行中的容器自动更新；必须执行 `docker compose up -d app builder` 重新创建服务。

## 5. 标准升级

升级前阅读目标 Release 说明。通用升级流程会先更新部署文件，再由新版脚本备份数据、拉取镜像和执行健康检查：

```bash
cd /opt/microbio-lab
TARGET_VERSION="v1.2.0"
DOWNLOAD_DIR="$(mktemp -d)"

curl -fL \
  "https://github.com/CodeAIX/MicroBioLab/releases/download/${TARGET_VERSION}/microbio-lab-${TARGET_VERSION}.tar.gz" \
  -o "$DOWNLOAD_DIR/microbio-lab-${TARGET_VERSION}.tar.gz"
curl -fL \
  "https://github.com/CodeAIX/MicroBioLab/releases/download/${TARGET_VERSION}/SHA256SUMS" \
  -o "$DOWNLOAD_DIR/SHA256SUMS"
(cd "$DOWNLOAD_DIR" && sha256sum -c SHA256SUMS)

sudo cp -a /opt/microbio-lab "/opt/microbio-lab-config-$(date +%Y%m%d-%H%M%S)"
sudo tar -xzf "$DOWNLOAD_DIR/microbio-lab-${TARGET_VERSION}.tar.gz" -C /opt/microbio-lab
sudo /opt/microbio-lab/scripts/upgrade.sh "$TARGET_VERSION"
rm -rf -- "$DOWNLOAD_DIR"
```

`upgrade.sh` 会：

1. 创建数据库和全部实验资产备份；
2. 预拉取目标 App/Builder 镜像；
3. 同时更新 `PLATFORM_VERSION` 与 `BUILDER_VERSION`；
4. 重建 App/Builder，自动执行增量数据库迁移；
5. 最多等待约 60 秒完成健康检查。

如果确认目标版本不涉及 Compose、Nginx 或脚本变化，也可以只执行：

```bash
cd /opt/microbio-lab
sudo ./scripts/upgrade.sh v1.2.0
```

## 6. 日常维护

状态与资源：

```bash
cd /opt/microbio-lab
sudo docker compose ps
sudo docker compose images
sudo docker compose top
sudo docker stats --no-stream
sudo ./scripts/healthcheck.sh
```

日志：

```bash
sudo docker compose logs --tail=200 app
sudo docker compose logs --tail=200 builder
sudo docker compose logs --tail=100 db
sudo docker compose logs -f --since=10m app builder
```

仅重启应用服务，不重启数据库和实验静态站：

```bash
sudo docker compose restart app builder
sudo ./scripts/healthcheck.sh
```

管理员维护：

```bash
sudo docker compose exec app node dist/cli/list-admins.js
sudo docker compose exec app node dist/cli/change-password.js --email admin@example.com
sudo docker compose exec app node dist/cli/disable-admin.js --email admin@example.com
```

## 7. 备份与恢复

创建完整备份：

```bash
cd /opt/microbio-lab
sudo ./scripts/backup.sh
sudo find /srv/microbio-lab/backups -mindepth 1 -maxdepth 1 -type d -printf '%TY-%Tm-%Td %TH:%TM %p\n' | sort
```

新版备份包含 PostgreSQL、`sources`、`builds`、`published` 和 `covers`，并包含 SHA256 校验文件。应定期把整个备份目录复制到另一台机器或对象存储。

恢复会覆盖当前数据库和相应资产，必须输入二次确认：

```bash
cd /opt/microbio-lab
sudo ./scripts/restore.sh /srv/microbio-lab/backups/2026-08-16_120000
```

## 8. 镜像回滚

```bash
cd /opt/microbio-lab
sudo ./scripts/rollback.sh v1.1.0
```

脚本会先备份再切换镜像。数据库迁移不会自动降级；只有在目标版本的 Release 说明确认向后兼容时才应回滚。需要精确恢复数据库时，使用升级前备份。

## 9. 离线镜像安装

在联网机器上准备 Docker archive 后复制到 VPS。导入目录内所有镜像：

```bash
cd /path/to/最新版镜像
for IMAGE_ARCHIVE in *.tar; do
  sudo docker load -i "$IMAGE_ARCHIVE"
done
sudo docker image ls | grep -E 'microbio-lab|postgres|nginx'
```

把离线包的 `部署文件` 复制到 `/opt/microbio-lab`，按第 2 节生成 `.env`，然后启动：

```bash
cd /opt/microbio-lab
sudo docker compose config --quiet
sudo docker compose up -d
sudo ./scripts/healthcheck.sh
```

离线包必须与 VPS 架构一致：`x86_64` 使用 `linux/amd64`，`aarch64`/`arm64` 使用 `linux/arm64`。

## 10. 卸载

仅移除容器和项目网络，保留镜像、配置及全部数据：

```bash
cd /opt/microbio-lab
sudo ./scripts/uninstall.sh
```

同时清理 MicroBio Lab 的 App/Builder 本地镜像；不会删除可能被其他项目共享的 PostgreSQL/Nginx 镜像：

```bash
sudo ./scripts/uninstall.sh --remove-images
```

永久删除 `/srv/microbio-lab` 数据需要显式参数和交互确认：

```bash
sudo ./scripts/uninstall.sh --remove-images --purge-data
```

确认不再需要部署配置后，最后单独删除配置目录：

```bash
cd /opt
sudo rm -rf -- /opt/microbio-lab
```

`--purge-data` 和最后一条命令不可恢复，必须先确认异机备份有效。

## 11. 常见检查

```bash
cd /opt/microbio-lab
sudo docker compose config --quiet
sudo docker compose ps
sudo ./scripts/healthcheck.sh
curl -fsS http://127.0.0.1:18080/health/ready
curl -fsS http://127.0.0.1:18081/healthz
df -h /srv/microbio-lab
sudo du -sh /srv/microbio-lab/{postgres,sources,builds,published,covers,backups}
```

构建失败先检查后台错误代码和 Builder 日志。数据库异常时确认 `.env` 中 `POSTGRES_PASSWORD` 与 `DATABASE_URL` 密码一致。发布失败时检查磁盘空间，以及 `/srv/microbio-lab/{sources,builds,published,covers}` 是否归 UID/GID `1000:1000` 所有。
