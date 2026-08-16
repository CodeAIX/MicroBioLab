#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"
if [[ -f .env ]]; then set -a; source .env; set +a; fi
APP_PORT="${APP_PORT:-18080}"
EXP_PORT="${EXP_PORT:-18081}"
curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/health/ready"
printf '\n'
curl --fail --silent --show-error "http://127.0.0.1:${EXP_PORT}/healthz"
printf '\nAll services are healthy.\n'
