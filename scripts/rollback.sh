#!/usr/bin/env bash
set -Eeuo pipefail
if [[ $# -ne 1 || ! "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]]; then echo "用法：$0 v1.0.0" >&2; exit 1; fi
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"
if [[ ! -f .env ]]; then echo "缺少 $PROJECT_DIR/.env" >&2; exit 1; fi
CURRENT="$(sed -n 's/^PLATFORM_VERSION=//p' .env | head -n1)"
if [[ "$CURRENT" == "$1" ]]; then echo "当前已经是 $1，无需回滚"; exit 0; fi
echo "回滚镜像：${CURRENT:-unknown} -> $1"
"$SCRIPT_DIR/backup.sh"
cp -p .env ".env.pre-rollback-$(date '+%Y%m%d-%H%M%S')"
PLATFORM_VERSION="$1" docker compose pull app builder
sed -i.bak "s/^PLATFORM_VERSION=.*/PLATFORM_VERSION=$1/" .env
sed -i.bak "s/^BUILDER_VERSION=.*/BUILDER_VERSION=$1/" .env
docker compose config --quiet
docker compose up -d app builder
"$SCRIPT_DIR/healthcheck.sh"
echo "镜像已回滚到 $1；数据库迁移不会自动降级，永久数据未删除。"
