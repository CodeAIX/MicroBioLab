#!/usr/bin/env bash
set -Eeuo pipefail
if [[ $# -ne 1 || ! "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]]; then echo "用法：$0 v1.0.0" >&2; exit 1; fi
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"
sed -i.bak "s/^PLATFORM_VERSION=.*/PLATFORM_VERSION=$1/" .env
sed -i.bak "s/^BUILDER_VERSION=.*/BUILDER_VERSION=$1/" .env
docker compose pull app builder
docker compose up -d app builder
"$SCRIPT_DIR/healthcheck.sh"
echo "镜像已回滚到 $1；永久数据未删除。"
