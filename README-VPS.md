# VPS 极简部署

适用于已经安装 Docker 的 Ubuntu/Debian VPS。平台不安装 Nginx、不占用宿主机 8080，只监听：

```text
主平台：http://127.0.0.1:18080
实验站：http://127.0.0.1:18081
```

Compose 中出现的 `:8080` 是容器内部端口，不是宿主机端口，不会与 VPS 上其他容器冲突。

## 1. 检查依赖，缺少时再安装

先显示已有版本：

```bash
docker --version
docker compose version
git --version 2>/dev/null || true
curl --version 2>/dev/null | head -n1 || true
openssl version 2>/dev/null || true
```

只安装缺少的基础命令：

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

如果 `docker compose version` 报错，先检查软件包，再只安装 Compose Plugin：

```bash
apt-cache policy docker-compose-plugin
sudo apt-get update
sudo apt-get install -y docker-compose-plugin
docker compose version
```

## 2. 下载部署文件

```bash
sudo install -d -o "$(id -u)" -g "$(id -g)" /opt/microbio-lab
git clone --branch v1.1.0 --depth 1 \
  https://github.com/CodeAIX/MicroBioLab.git \
  /opt/microbio-lab
cd /opt/microbio-lab
sudo ./scripts/install.sh
```

## 3. 配置

先设置 Cloudflare Tunnel 使用的两个不同域名：

```bash
PLATFORM_DOMAIN="lab.example.com"
EXPERIMENT_DOMAIN="exp.lab.example.com"
DB_PASSWORD="$(openssl rand -hex 24)"
SESSION_SECRET="$(openssl rand -hex 32)"

cp .env.example .env
chmod 600 .env
sed -i \
  -e 's|^GHCR_OWNER=.*|GHCR_OWNER=codeaix|' \
  -e 's|^PLATFORM_VERSION=.*|PLATFORM_VERSION=v1.1.0|' \
  -e 's|^BUILDER_VERSION=.*|BUILDER_VERSION=v1.1.0|' \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${DB_PASSWORD}|" \
  -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://microbio:${DB_PASSWORD}@db:5432/microbio|" \
  -e "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SECRET}|" \
  -e "s|^PLATFORM_ORIGIN=.*|PLATFORM_ORIGIN=https://${PLATFORM_DOMAIN}|" \
  -e "s|^EXPERIMENT_ORIGIN=.*|EXPERIMENT_ORIGIN=https://${EXPERIMENT_DOMAIN}|" \
  .env
unset DB_PASSWORD SESSION_SECRET

sudo docker compose config --quiet
```

## 4. 启动

GHCR 镜像为公开镜像，不需要 `docker login`：

```bash
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
./scripts/healthcheck.sh
```

创建管理员：

```bash
sudo docker compose exec app \
  node dist/cli/create-admin.js --email admin@example.com
```

## 5. Cloudflare Tunnel

在 Tunnel 中配置两个 Public Hostname：

```text
lab.example.com      -> HTTP -> 127.0.0.1:18080
exp.lab.example.com  -> HTTP -> 127.0.0.1:18081
```

浏览器访问 `https://lab.example.com/login`。外部必须使用 HTTPS；Tunnel 到本机服务使用 HTTP。两个域名不能相同。

实验站根路径显示 404 是预期行为，它只托管版本化实验静态文件。学生从主平台首页进入介绍页，再通过稳定运行地址和二维码进入实验。

本机检查：

```bash
curl -fsS http://127.0.0.1:18080/health/ready
curl -fsS http://127.0.0.1:18081/healthz
```

## 从 v1.0.x 升级到 v1.1.0

不需要安装新依赖，也不需要修改端口或 Cloudflare Tunnel。先备份，再切换两个版本变量；应用启动时会自动执行增量数据库迁移：

```bash
cd /opt/microbio-lab
sudo ./scripts/backup.sh
sudo sed -i \
  -e 's|^PLATFORM_VERSION=.*|PLATFORM_VERSION=v1.1.0|' \
  -e 's|^BUILDER_VERSION=.*|BUILDER_VERSION=v1.1.0|' \
  .env
sudo docker compose pull app builder
sudo docker compose up -d --wait app builder
./scripts/healthcheck.sh
```

升级不会改变 `/srv/microbio-lab` 中的源码、构建结果、发布文件、封面或数据库数据。

## 日常命令

```bash
cd /opt/microbio-lab
sudo docker compose ps
sudo docker compose logs -f app
sudo docker compose logs -f builder
sudo ./scripts/backup.sh
sudo ./scripts/upgrade.sh v1.1.0
sudo ./scripts/rollback.sh v1.0.4
```

数据固定保存在 `/srv/microbio-lab`。`docker compose down` 不会删除数据；不要运行 `./scripts/uninstall.sh --purge-data`，除非确实需要永久清除且已有异机备份。
