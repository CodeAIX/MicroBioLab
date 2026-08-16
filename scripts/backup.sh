#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"
set -a; source .env; set +a
if [[ "${DATA_ROOT:-}" != "/srv/microbio-lab" ]]; then echo "拒绝备份非标准 DATA_ROOT" >&2; exit 1; fi
STAMP="$(date '+%Y-%m-%d_%H%M%S')"
DEST="$DATA_ROOT/backups/$STAMP"
mkdir -p "$DEST"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$DEST/database.dump"
tar -C "$DATA_ROOT" -czf "$DEST/sources.tar.gz" sources
tar -C "$DATA_ROOT" -czf "$DEST/published.tar.gz" published
tar -C "$DATA_ROOT" -czf "$DEST/covers.tar.gz" covers
printf '{"schemaVersion":1,"createdAt":"%s","platformVersion":"%s"}\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$PLATFORM_VERSION" > "$DEST/metadata.json"
(cd "$DEST" && sha256sum database.dump sources.tar.gz published.tar.gz covers.tar.gz metadata.json > SHA256SUMS)
echo "备份完成：$DEST"
