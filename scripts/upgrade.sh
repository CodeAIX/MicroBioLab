#!/usr/bin/env bash
set -Eeuo pipefail
if [[ $# -ne 1 || ! "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]]; then echo "用法：$0 v1.1.0" >&2; exit 1; fi
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"
CURRENT="$(sed -n 's/^PLATFORM_VERSION=//p' .env | head -n1)"
echo "升级：${CURRENT:-unknown} -> $1"
"$SCRIPT_DIR/backup.sh"
cp .env .env.pre-upgrade
sed -i.bak "s/^PLATFORM_VERSION=.*/PLATFORM_VERSION=$1/" .env
sed -i.bak "s/^BUILDER_VERSION=.*/BUILDER_VERSION=$1/" .env
docker compose pull
docker compose up -d
if ! "$SCRIPT_DIR/healthcheck.sh"; then
  echo "升级健康检查失败；可运行：./scripts/rollback.sh ${CURRENT}" >&2
  exit 1
fi
echo "升级完成：$1"
