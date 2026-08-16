#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"
docker compose down
if [[ "${1:-}" != "--purge-data" ]]; then echo "平台已停止，/srv/microbio-lab 数据已保留。"; exit 0; fi
set -a; source .env; set +a
if [[ "${DATA_ROOT:-}" != "/srv/microbio-lab" ]]; then echo "拒绝清理非标准目录" >&2; exit 1; fi
read -r -p "这将永久删除 /srv/microbio-lab。输入 PURGE-MICROBIO-LAB：" CONFIRM
if [[ "$CONFIRM" != "PURGE-MICROBIO-LAB" ]]; then echo "已取消"; exit 1; fi
rm -rf -- /srv/microbio-lab
echo "永久数据已删除，无法从本机恢复。"
