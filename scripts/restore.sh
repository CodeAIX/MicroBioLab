#!/usr/bin/env bash
set -Eeuo pipefail
if [[ $# -ne 1 ]]; then echo "用法：$0 /srv/microbio-lab/backups/<backup>" >&2; exit 1; fi
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"
set -a; source .env; set +a
BACKUP="$(cd -- "$1" && pwd)"
if [[ "${DATA_ROOT:-}" != "/srv/microbio-lab" || "$BACKUP" != /srv/microbio-lab/backups/* ]]; then echo "拒绝非标准恢复路径" >&2; exit 1; fi
(cd "$BACKUP" && sha256sum -c SHA256SUMS)
read -r -p "恢复将覆盖当前数据库和资产。输入 RESTORE 继续：" CONFIRM
if [[ "$CONFIRM" != "RESTORE" ]]; then echo "已取消"; exit 1; fi
docker compose stop app builder
trap 'docker compose up -d' EXIT
tar -C "$DATA_ROOT" -xzf "$BACKUP/sources.tar.gz"
tar -C "$DATA_ROOT" -xzf "$BACKUP/published.tar.gz"
tar -C "$DATA_ROOT" -xzf "$BACKUP/covers.tar.gz"
docker compose exec -T db dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"
docker compose exec -T db createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < "$BACKUP/database.dump"
docker compose up -d
trap - EXIT
"$SCRIPT_DIR/healthcheck.sh"
echo "恢复完成"
