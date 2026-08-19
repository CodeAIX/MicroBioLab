#!/usr/bin/env bash
set -Eeuo pipefail
if [[ $# -ne 1 || ! "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]]; then echo "用法：$0 v1.3.0" >&2; exit 1; fi
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"
if [[ ! -f .env ]]; then echo "缺少 $PROJECT_DIR/.env" >&2; exit 1; fi
CURRENT="$(sed -n 's/^PLATFORM_VERSION=//p' .env | head -n1)"
if [[ -z "$CURRENT" ]]; then echo ".env 中缺少 PLATFORM_VERSION" >&2; exit 1; fi
if [[ "$CURRENT" == "$1" ]]; then echo "当前已经是 $1，无需升级"; exit 0; fi
echo "升级：${CURRENT:-unknown} -> $1"
"$SCRIPT_DIR/backup.sh"
ENV_BACKUP=".env.pre-upgrade-$(date '+%Y%m%d-%H%M%S')"
cp -p .env "$ENV_BACKUP"
PLATFORM_VERSION="$1" docker compose pull app builder
sed -i.bak "s/^PLATFORM_VERSION=.*/PLATFORM_VERSION=$1/" .env
sed -i.bak "s/^BUILDER_VERSION=.*/BUILDER_VERSION=$1/" .env
docker compose config --quiet
docker compose up -d app builder
if ! "$SCRIPT_DIR/healthcheck.sh"; then
  echo "升级健康检查失败；升级前环境文件保存在 $ENV_BACKUP，可运行：./scripts/rollback.sh ${CURRENT}" >&2
  exit 1
fi
if [[ "${EUID}" -eq 0 ]]; then
  "$SCRIPT_DIR/install-management-command.sh"
else
  echo "可运行 sudo ./scripts/install-management-command.sh 安装 mbl 维护命令。"
fi
echo "升级完成：$1"
