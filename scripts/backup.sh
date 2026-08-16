#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"
if [[ ! -f .env ]]; then echo "缺少 $PROJECT_DIR/.env" >&2; exit 1; fi
set -a; source .env; set +a
if [[ "${DATA_ROOT:-}" != "/srv/microbio-lab" ]]; then echo "拒绝备份非标准 DATA_ROOT" >&2; exit 1; fi
for REQUIRED_DIR in sources builds published covers backups; do
  if [[ ! -d "$DATA_ROOT/$REQUIRED_DIR" ]]; then echo "缺少数据目录：$DATA_ROOT/$REQUIRED_DIR" >&2; exit 1; fi
done
STAMP="$(date '+%Y-%m-%d_%H%M%S')"
DEST="$DATA_ROOT/backups/$STAMP"
if [[ -e "$DEST" ]]; then DEST="${DEST}-$$"; fi
PARTIAL="$DATA_ROOT/backups/.partial-$(basename "$DEST")"
cleanup_partial() {
  if [[ -n "${PARTIAL:-}" && "$PARTIAL" == /srv/microbio-lab/backups/.partial-* ]]; then rm -rf -- "$PARTIAL"; fi
}
trap cleanup_partial EXIT
mkdir -m 0700 "$PARTIAL"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$PARTIAL/database.dump"
for ASSET in sources builds published covers; do
  tar -C "$DATA_ROOT" -czf "$PARTIAL/${ASSET}.tar.gz" "$ASSET"
done
printf '{"schemaVersion":2,"createdAt":"%s","platformVersion":"%s"}\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$PLATFORM_VERSION" > "$PARTIAL/metadata.json"
(cd "$PARTIAL" && sha256sum database.dump sources.tar.gz builds.tar.gz published.tar.gz covers.tar.gz metadata.json > SHA256SUMS)
mv "$PARTIAL" "$DEST"
PARTIAL=""
trap - EXIT
echo "备份完成：$DEST"
