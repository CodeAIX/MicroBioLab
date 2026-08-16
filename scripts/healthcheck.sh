#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"
if [[ -f .env ]]; then set -a; source .env; set +a; fi
APP_PORT="${APP_PORT:-18080}"
EXP_PORT="${EXP_PORT:-18081}"
ATTEMPTS="${HEALTHCHECK_ATTEMPTS:-30}"
INTERVAL="${HEALTHCHECK_INTERVAL:-2}"

if ! [[ "$ATTEMPTS" =~ ^[1-9][0-9]*$ && "$INTERVAL" =~ ^[0-9]+$ ]]; then
  echo "HEALTHCHECK_ATTEMPTS 必须是正整数，HEALTHCHECK_INTERVAL 必须是非负整数" >&2
  exit 1
fi

for ATTEMPT in $(seq 1 "$ATTEMPTS"); do
  if APP_RESPONSE="$(curl --fail --silent "http://127.0.0.1:${APP_PORT}/health/ready" 2>/dev/null)" \
    && EXP_RESPONSE="$(curl --fail --silent "http://127.0.0.1:${EXP_PORT}/healthz" 2>/dev/null)"; then
    printf '%s\n%s\n\nAll services are healthy.\n' "$APP_RESPONSE" "$EXP_RESPONSE"
    exit 0
  fi
  if [[ "$ATTEMPT" -lt "$ATTEMPTS" ]]; then sleep "$INTERVAL"; fi
done

echo "健康检查失败：主平台 127.0.0.1:${APP_PORT} 或实验站 127.0.0.1:${EXP_PORT} 未就绪" >&2
docker compose ps >&2 || true
exit 1
