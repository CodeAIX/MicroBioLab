#!/usr/bin/env bash
set -Eeuo pipefail

VERSION_PATTERN='^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$'
HOST_PATTERN='^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$'

usage() {
  cat <<'EOF'
用法：sudo bash bootstrap.sh <vX.Y.Z> [主平台域名] [实验站域名] [管理员邮箱]

示例：
  sudo bash bootstrap.sh v1.3.0 lab.example.com exp.lab.example.com admin@example.com

需要预先安装 Docker Engine 和 Docker Compose Plugin。
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then usage; exit 0; fi
if [[ "${EUID}" -ne 0 ]]; then echo "请使用 sudo 或 root 运行部署脚本" >&2; exit 1; fi
if [[ ! -t 0 ]]; then echo "部署需要交互确认和管理员密码；请先下载脚本，再从终端执行，不要使用 curl | bash" >&2; exit 1; fi
if [[ $# -lt 1 || $# -gt 4 || ! "$1" =~ $VERSION_PATTERN ]]; then usage >&2; exit 1; fi
for command in curl openssl sha256sum tar docker; do
  if ! command -v "$command" >/dev/null 2>&1; then echo "缺少依赖：$command" >&2; exit 1; fi
done
if ! docker compose version >/dev/null 2>&1; then echo "缺少 Docker Compose Plugin" >&2; exit 1; fi

INSTALL_VERSION="$1"
PLATFORM_DOMAIN="${2:-}"
EXPERIMENT_DOMAIN="${3:-}"
ADMIN_EMAIL="${4:-}"
PROJECT_DIR="/opt/microbio-lab"
DATA_ROOT="/srv/microbio-lab"
ARCHIVE="microbio-lab-${INSTALL_VERSION}.tar.gz"
RELEASE_URL="https://github.com/CodeAIX/MicroBioLab/releases/download/${INSTALL_VERSION}"

if [[ -f "$PROJECT_DIR/.env" ]]; then
  echo "检测到现有部署，请运行 sudo mbl upgrade $INSTALL_VERSION，不要重复安装。" >&2
  exit 1
fi
if [[ -d "$PROJECT_DIR" && -n "$(find "$PROJECT_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "目标目录非空且不是有效部署：$PROJECT_DIR；为保护文件已停止。" >&2
  exit 1
fi
if [[ -d "$DATA_ROOT" && -n "$(find "$DATA_ROOT" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "检测到既有数据：$DATA_ROOT；请先确认恢复或清理方案，自动部署不会覆盖。" >&2
  exit 1
fi

if [[ -z "$PLATFORM_DOMAIN" ]]; then read -r -p "主平台域名（例如 lab.example.com）：" PLATFORM_DOMAIN; fi
if [[ -z "$EXPERIMENT_DOMAIN" ]]; then read -r -p "实验站域名（例如 exp.lab.example.com）：" EXPERIMENT_DOMAIN; fi
if [[ -z "$ADMIN_EMAIL" ]]; then read -r -p "首位管理员邮箱：" ADMIN_EMAIL; fi
PLATFORM_DOMAIN="$(printf '%s' "$PLATFORM_DOMAIN" | tr '[:upper:]' '[:lower:]')"
EXPERIMENT_DOMAIN="$(printf '%s' "$EXPERIMENT_DOMAIN" | tr '[:upper:]' '[:lower:]')"

if [[ ! "$PLATFORM_DOMAIN" =~ $HOST_PATTERN ]]; then echo "主平台域名格式无效" >&2; exit 1; fi
if [[ ! "$EXPERIMENT_DOMAIN" =~ $HOST_PATTERN ]]; then echo "实验站域名格式无效" >&2; exit 1; fi
if [[ "$PLATFORM_DOMAIN" == "$EXPERIMENT_DOMAIN" ]]; then echo "主平台与实验站必须使用不同域名" >&2; exit 1; fi
if [[ ! "$ADMIN_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then echo "管理员邮箱格式无效" >&2; exit 1; fi

cat <<EOF
即将部署 MicroBio Lab：
  版本：$INSTALL_VERSION
  主平台：https://$PLATFORM_DOMAIN
  实验站：https://$EXPERIMENT_DOMAIN
  管理员：$ADMIN_EMAIL
  配置目录：$PROJECT_DIR
  数据目录：$DATA_ROOT
EOF
read -r -p "输入 INSTALL-MICROBIO-LAB 继续：" CONFIRM
if [[ "$CONFIRM" != "INSTALL-MICROBIO-LAB" ]]; then echo "已取消"; exit 1; fi

DOWNLOAD_DIR="$(mktemp -d)"
cleanup() { rm -rf -- "$DOWNLOAD_DIR"; }
trap cleanup EXIT

curl -fL "$RELEASE_URL/$ARCHIVE" -o "$DOWNLOAD_DIR/$ARCHIVE"
curl -fL "$RELEASE_URL/SHA256SUMS" -o "$DOWNLOAD_DIR/SHA256SUMS"
(cd "$DOWNLOAD_DIR" && sha256sum -c SHA256SUMS)

while IFS= read -r entry; do
  case "$entry" in
    /*|..|../*|*/../*|*/..|.env|./.env)
      echo "Release 资产包含不安全路径：$entry" >&2
      exit 1
      ;;
  esac
done < <(tar -tzf "$DOWNLOAD_DIR/$ARCHIVE")

install -d -m 0755 "$PROJECT_DIR"
tar --no-same-owner -xzf "$DOWNLOAD_DIR/$ARCHIVE" -C "$PROJECT_DIR"
cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
chmod 600 "$PROJECT_DIR/.env"

DB_PASSWORD="$(openssl rand -hex 24)"
SESSION_SECRET="$(openssl rand -hex 32)"
POSTGRES_DB="$(sed -n 's/^POSTGRES_DB=//p' "$PROJECT_DIR/.env" | head -n1)"
POSTGRES_USER="$(sed -n 's/^POSTGRES_USER=//p' "$PROJECT_DIR/.env" | head -n1)"
if [[ ! "$POSTGRES_DB" =~ ^[A-Za-z0-9_]+$ || ! "$POSTGRES_USER" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "Release 环境样例中的 PostgreSQL 标识无效" >&2
  exit 1
fi
sed -i \
  -e 's|^GHCR_OWNER=.*|GHCR_OWNER=codeaix|' \
  -e "s|^PLATFORM_VERSION=.*|PLATFORM_VERSION=$INSTALL_VERSION|" \
  -e "s|^BUILDER_VERSION=.*|BUILDER_VERSION=$INSTALL_VERSION|" \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$DB_PASSWORD|" \
  -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://$POSTGRES_USER:$DB_PASSWORD@db:5432/$POSTGRES_DB|" \
  -e "s|^SESSION_SECRET=.*|SESSION_SECRET=$SESSION_SECRET|" \
  -e "s|^PLATFORM_ORIGIN=.*|PLATFORM_ORIGIN=https://$PLATFORM_DOMAIN|" \
  -e "s|^EXPERIMENT_ORIGIN=.*|EXPERIMENT_ORIGIN=https://$EXPERIMENT_DOMAIN|" \
  "$PROJECT_DIR/.env"
unset DB_PASSWORD SESSION_SECRET POSTGRES_DB POSTGRES_USER

"$PROJECT_DIR/scripts/install.sh"
cd "$PROJECT_DIR"
docker compose config --quiet
docker compose pull
docker compose up -d
"$PROJECT_DIR/scripts/healthcheck.sh"

echo "请输入首位管理员密码："
docker compose exec app node dist/cli/create-admin.js --email "$ADMIN_EMAIL"
docker compose ps

cat <<EOF
部署完成。
下一步请把 Cloudflare Tunnel 配置为：
  $PLATFORM_DOMAIN -> http://127.0.0.1:18080
  $EXPERIMENT_DOMAIN -> http://127.0.0.1:18081
日常维护：sudo mbl
EOF
