#!/usr/bin/env bash
set -Eeuo pipefail
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"
BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:18080}"
COOKIE_FILE="$(mktemp)"
RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$COOKIE_FILE" "$RESPONSE_FILE"' EXIT

wait_for_build() {
  local version_id="$1"
  local status=""
  for _attempt in $(seq 1 45); do
    curl --fail --silent --show-error -b "$COOKIE_FILE" "$BASE_URL/api/versions/$version_id" > "$RESPONSE_FILE"
    status="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).version.status)' "$RESPONSE_FILE")"
    if [[ "$status" == "success" ]]; then return 0; fi
    if [[ "$status" == "failed" ]]; then cat "$RESPONSE_FILE"; return 1; fi
    sleep 1
  done
  echo "Builder timed out" >&2
  return 1
}

printf '%s\n' 'IntegrationTest-Password-2026' | docker compose -f compose.dev.yaml exec -T app node dist/cli/create-admin.js --email admin@example.com
curl --fail --silent --show-error -c "$COOKIE_FILE" -H 'Content-Type: application/json' -d '{"email":"admin@example.com","password":"IntegrationTest-Password-2026"}' "$BASE_URL/api/auth/login" > /dev/null
curl --fail --silent --show-error -b "$COOKIE_FILE" -F 'title=肠道杆菌的分离培养与生化鉴定' -F 'slug=enterobacteria-identification' -F 'category=肠道杆菌' -F 'description=医学微生物学虚拟仿真实验' -F 'jsx=@samples/enterobacteria/App.jsx;type=text/jsx' "$BASE_URL/api/experiments" > "$RESPONSE_FILE"
EXPERIMENT_ID="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).experimentId)' "$RESPONSE_FILE")"
VERSION_ID="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).versionId)' "$RESPONSE_FILE")"
wait_for_build "$VERSION_ID"
curl --fail --silent --show-error -b "$COOKIE_FILE" -X POST "$BASE_URL/api/versions/$VERSION_ID/publish" > /dev/null
curl --fail --silent --show-error "$BASE_URL/api/public/experiments/enterobacteria-identification" | grep -q 'v000001'

# A cover is deliberately omitted: the student UI must use its deterministic generated theme.
curl --fail --silent --show-error -b "$COOKIE_FILE" -F 'title=教学顺序演示实验' -F 'slug=teaching-order-demo' -F 'category=教学演示' -F 'description=用于验证无封面创建、教学排序、介绍页和二维码的自动化实验。' -F 'jsx=@samples/enterobacteria/App.jsx;type=text/jsx' "$BASE_URL/api/experiments" > "$RESPONSE_FILE"
SECOND_EXPERIMENT_ID="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).experimentId)' "$RESPONSE_FILE")"
SECOND_VERSION_ID="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).versionId)' "$RESPONSE_FILE")"
wait_for_build "$SECOND_VERSION_ID"
curl --fail --silent --show-error -b "$COOKIE_FILE" -X POST "$BASE_URL/api/versions/$SECOND_VERSION_ID/publish" > /dev/null

printf '{"experimentIds":["%s","%s"]}' "$SECOND_EXPERIMENT_ID" "$EXPERIMENT_ID" > "$RESPONSE_FILE"
curl --fail --silent --show-error -b "$COOKIE_FILE" -H 'Content-Type: application/json' -X PUT --data-binary "@$RESPONSE_FILE" "$BASE_URL/api/experiments/order" > /dev/null
curl --fail --silent --show-error "$BASE_URL/api/public/experiments" > "$RESPONSE_FILE"
node -e 'const fs=require("fs");const items=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).experiments;if(items[0]?.slug!=="teaching-order-demo"||items[0]?.cover_path!==null)process.exit(1)' "$RESPONSE_FILE"

curl --fail --silent --show-error -b "$COOKIE_FILE" -X POST "$BASE_URL/api/experiments/$EXPERIMENT_ID/archive" > /dev/null
if curl --fail --silent "$BASE_URL/api/public/experiments/enterobacteria-identification" > /dev/null; then echo "Archived experiment leaked to public API" >&2; exit 1; fi
curl --fail --silent --show-error -b "$COOKIE_FILE" -X POST "$BASE_URL/api/experiments/$EXPERIMENT_ID/restore" > /dev/null
curl --fail --silent --show-error -b "$COOKIE_FILE" -X POST "$BASE_URL/api/versions/$VERSION_ID/publish" > /dev/null
echo "Sample integration flow passed."
