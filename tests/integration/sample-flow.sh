#!/usr/bin/env bash
set -Eeuo pipefail
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"
BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:18080}"
COOKIE_FILE="$(mktemp)"
RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$COOKIE_FILE" "$RESPONSE_FILE"' EXIT

printf '%s\n' 'IntegrationTest-Password-2026' | docker compose -f compose.dev.yaml exec -T app node dist/cli/create-admin.js --email admin@example.com
curl --fail --silent --show-error -c "$COOKIE_FILE" -H 'Content-Type: application/json' -d '{"email":"admin@example.com","password":"IntegrationTest-Password-2026"}' "$BASE_URL/api/auth/login" > /dev/null
curl --fail --silent --show-error -b "$COOKIE_FILE" -F 'title=肠道杆菌的分离培养与生化鉴定' -F 'slug=enterobacteria-identification' -F 'category=肠道杆菌' -F 'description=医学微生物学虚拟仿真实验' -F 'jsx=@samples/enterobacteria/App.jsx;type=text/jsx' "$BASE_URL/api/experiments" > "$RESPONSE_FILE"
EXPERIMENT_ID="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).experimentId)' "$RESPONSE_FILE")"
VERSION_ID="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).versionId)' "$RESPONSE_FILE")"

for ATTEMPT in $(seq 1 45); do
  curl --fail --silent --show-error -b "$COOKIE_FILE" "$BASE_URL/api/versions/$VERSION_ID" > "$RESPONSE_FILE"
  STATUS="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).version.status)' "$RESPONSE_FILE")"
  if [[ "$STATUS" == "success" ]]; then break; fi
  if [[ "$STATUS" == "failed" ]]; then cat "$RESPONSE_FILE"; exit 1; fi
  sleep 1
done
if [[ "${STATUS:-}" != "success" ]]; then echo "Builder timed out" >&2; exit 1; fi
curl --fail --silent --show-error -b "$COOKIE_FILE" -X POST "$BASE_URL/api/versions/$VERSION_ID/publish" > /dev/null
curl --fail --silent --show-error "$BASE_URL/api/public/experiments/enterobacteria-identification" | grep -q 'v000001'
curl --fail --silent --show-error -b "$COOKIE_FILE" -X POST "$BASE_URL/api/experiments/$EXPERIMENT_ID/archive" > /dev/null
if curl --fail --silent "$BASE_URL/api/public/experiments/enterobacteria-identification" > /dev/null; then echo "Archived experiment leaked to public API" >&2; exit 1; fi
curl --fail --silent --show-error -b "$COOKIE_FILE" -X POST "$BASE_URL/api/experiments/$EXPERIMENT_ID/restore" > /dev/null
curl --fail --silent --show-error -b "$COOKIE_FILE" -X POST "$BASE_URL/api/versions/$VERSION_ID/publish" > /dev/null
echo "Sample integration flow passed."
