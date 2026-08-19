#!/usr/bin/env bash
set -Eeuo pipefail
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"
BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:18080}"
COOKIE_FILE="$(mktemp)"
RESPONSE_FILE="$(mktemp)"
REQUEST_FILE="$(mktemp)"
trap 'rm -f "$COOKIE_FILE" "$RESPONSE_FILE" "$REQUEST_FILE"' EXIT

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

wait_for_batch() {
  local batch_id="$1"
  local status=""
  for _attempt in $(seq 1 90); do
    curl --fail --silent --show-error -b "$COOKIE_FILE" "$BASE_URL/api/batch-updates/$batch_id" > "$RESPONSE_FILE"
    status="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).batch.status)' "$RESPONSE_FILE")"
    if [[ "$status" == "ready" ]]; then return 0; fi
    if [[ "$status" == "failed" ]]; then cat "$RESPONSE_FILE"; return 1; fi
    sleep 1
  done
  echo "Batch build timed out" >&2
  return 1
}

printf '%s\n' 'IntegrationTest-Password-2026' | docker compose -f compose.dev.yaml exec -T app node dist/cli/create-admin.js --email admin@example.com
curl --fail --silent --show-error -c "$COOKIE_FILE" -H 'Content-Type: application/json' -d '{"email":"admin@example.com","password":"IntegrationTest-Password-2026"}' "$BASE_URL/api/auth/login" > /dev/null
curl --fail --silent --show-error -b "$COOKIE_FILE" -F 'title=肠道杆菌的分离培养与生化鉴定' -F 'slug=enterobacteria-identification' -F 'category=肠道杆菌' -F 'description=医学微生物学虚拟仿真实验' -F 'knowledge=@samples/enterobacteria/KnowledgeReview.md;type=text/markdown' -F 'jsx=@samples/enterobacteria/App.jsx;type=text/jsx' "$BASE_URL/api/experiments" > "$RESPONSE_FILE"
EXPERIMENT_ID="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).experimentId)' "$RESPONSE_FILE")"
VERSION_ID="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).versionId)' "$RESPONSE_FILE")"
wait_for_build "$VERSION_ID"
curl --fail --silent --show-error -b "$COOKIE_FILE" -X POST "$BASE_URL/api/versions/$VERSION_ID/publish" > /dev/null
curl --fail --silent --show-error "$BASE_URL/api/public/experiments/enterobacteria-identification" | grep -q 'v000001'
curl --fail --silent --show-error "$BASE_URL/api/public/experiments/enterobacteria-identification/knowledge-review" | grep -q '核心判断'

# A cover is deliberately omitted: the student UI must use its deterministic generated theme.
curl --fail --silent --show-error -b "$COOKIE_FILE" -F 'title=教学顺序演示实验' -F 'slug=teaching-order-demo' -F 'category=教学演示' -F 'description=用于验证无封面创建、教学排序、介绍页和二维码的自动化实验。' -F 'jsx=@samples/enterobacteria/App.jsx;type=text/jsx' "$BASE_URL/api/experiments" > "$RESPONSE_FILE"
SECOND_EXPERIMENT_ID="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).experimentId)' "$RESPONSE_FILE")"
SECOND_VERSION_ID="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).versionId)' "$RESPONSE_FILE")"
wait_for_build "$SECOND_VERSION_ID"
curl --fail --silent --show-error -b "$COOKIE_FILE" -X POST "$BASE_URL/api/versions/$SECOND_VERSION_ID/publish" > /dev/null

node -e '
const fs=require("fs"),crypto=require("crypto");
const files=process.argv.slice(2).map((filename)=>{const data=fs.readFileSync(filename);return {filename:filename.split("/").pop(),relativePath:filename,size:data.length,sha256:crypto.createHash("sha256").update(data).digest("hex")}});
fs.writeFileSync(process.argv[1],JSON.stringify({files}));
' "$REQUEST_FILE" tests/fixtures/batch-initial/enterobacteria-identification-vsim.jsx tests/fixtures/batch-initial/teaching-order-demo-vsim.jsx
curl --fail --silent --show-error -b "$COOKIE_FILE" -H 'Content-Type: application/json' --data-binary "@$REQUEST_FILE" "$BASE_URL/api/batch-updates/preflight" > "$RESPONSE_FILE"
node -e 'const fs=require("fs");const rows=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).files;if(rows.length!==2||rows.some((row)=>row.status!=="ready"))process.exit(1)' "$RESPONSE_FILE"

curl --fail --silent --show-error -b "$COOKIE_FILE" \
  -F 'jsx=@tests/fixtures/batch-initial/enterobacteria-identification-vsim.jsx;type=text/jsx' \
  -F 'jsx=@tests/fixtures/batch-initial/teaching-order-demo-vsim.jsx;type=text/jsx' \
  "$BASE_URL/api/batch-updates" > "$RESPONSE_FILE"
BATCH_ID="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).batchId)' "$RESPONSE_FILE")"
wait_for_batch "$BATCH_ID"
ENTERO_BATCH_VERSION_ID="$(node -e 'const fs=require("fs");const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(body.items.find((item)=>item.slug==="enterobacteria-identification").version_id)' "$RESPONSE_FILE")"
curl --fail --silent --show-error -b "$COOKIE_FILE" -X POST "$BASE_URL/api/batch-updates/$BATCH_ID/publish" > /dev/null
curl --fail --silent --show-error "$BASE_URL/api/public/experiments/enterobacteria-identification" | grep -q 'v000002'
curl --fail --silent --show-error "$BASE_URL/api/public/experiments/teaching-order-demo" | grep -q 'v000002'
curl --fail --silent --show-error -b "$COOKIE_FILE" "$BASE_URL/api/versions/cleanup-candidates" > "$RESPONSE_FILE"
node -e 'const fs=require("fs");const rows=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).candidates;if(rows.some((item)=>item.id===process.argv[2]||item.id===process.argv[3]))process.exit(1)' "$RESPONSE_FILE" "$VERSION_ID" "$ENTERO_BATCH_VERSION_ID"
printf '{"versionIds":["%s"]}' "$VERSION_ID" > "$REQUEST_FILE"
if curl --fail --silent -b "$COOKIE_FILE" -H 'Content-Type: application/json' --data-binary "@$REQUEST_FILE" "$BASE_URL/api/versions/bulk-delete" > /dev/null; then echo "Bulk cleanup accepted a published history version" >&2; exit 1; fi

printf '{"experimentIds":["%s","%s"]}' "$SECOND_EXPERIMENT_ID" "$EXPERIMENT_ID" > "$RESPONSE_FILE"
curl --fail --silent --show-error -b "$COOKIE_FILE" -H 'Content-Type: application/json' -X PUT --data-binary "@$RESPONSE_FILE" "$BASE_URL/api/experiments/order" > /dev/null
curl --fail --silent --show-error "$BASE_URL/api/public/experiments" > "$RESPONSE_FILE"
node -e 'const fs=require("fs");const items=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).experiments;if(items[0]?.slug!=="teaching-order-demo"||items[0]?.cover_path!==null)process.exit(1)' "$RESPONSE_FILE"

curl --fail --silent --show-error -b "$COOKIE_FILE" -X POST "$BASE_URL/api/experiments/$EXPERIMENT_ID/archive" > /dev/null
if curl --fail --silent "$BASE_URL/api/public/experiments/enterobacteria-identification" > /dev/null; then echo "Archived experiment leaked to public API" >&2; exit 1; fi
curl --fail --silent --show-error -b "$COOKIE_FILE" -X POST "$BASE_URL/api/experiments/$EXPERIMENT_ID/restore" > /dev/null
curl --fail --silent --show-error -b "$COOKIE_FILE" -X POST "$BASE_URL/api/versions/$ENTERO_BATCH_VERSION_ID/publish" > /dev/null

curl --fail --silent --show-error -b "$COOKIE_FILE" -F 'jsx=@samples/enterobacteria/App.jsx;type=text/jsx' "$BASE_URL/api/experiments/$EXPERIMENT_ID/versions" > "$RESPONSE_FILE"
CLEANUP_VERSION_ID="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).versionId)' "$RESPONSE_FILE")"
wait_for_build "$CLEANUP_VERSION_ID"
curl --fail --silent --show-error -b "$COOKIE_FILE" "$BASE_URL/api/versions/cleanup-candidates" > "$RESPONSE_FILE"
node -e 'const fs=require("fs");const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!body.candidates.some((item)=>item.id===process.argv[2]&&item.total_bytes>0))process.exit(1)' "$RESPONSE_FILE" "$CLEANUP_VERSION_ID"
printf '{"versionIds":["%s"]}' "$CLEANUP_VERSION_ID" > "$REQUEST_FILE"
curl --fail --silent --show-error -b "$COOKIE_FILE" -H 'Content-Type: application/json' --data-binary "@$REQUEST_FILE" "$BASE_URL/api/versions/bulk-delete" > /dev/null
if curl --fail --silent -b "$COOKIE_FILE" "$BASE_URL/api/versions/$CLEANUP_VERSION_ID" > /dev/null; then echo "Bulk-deleted version still exists" >&2; exit 1; fi
echo "Sample integration flow passed."
