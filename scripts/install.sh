#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${EUID}" -ne 0 ]]; then echo "请使用 sudo 运行 install.sh" >&2; exit 1; fi
DATA_ROOT="${DATA_ROOT:-/srv/microbio-lab}"
if [[ "$DATA_ROOT" != "/srv/microbio-lab" ]]; then echo "首次安装只接受固定 DATA_ROOT=/srv/microbio-lab" >&2; exit 1; fi
install -d -m 0755 /opt/microbio-lab "$DATA_ROOT"
install -d -m 0700 "$DATA_ROOT/postgres" "$DATA_ROOT/backups"
install -d -o 1000 -g 1000 -m 0755 "$DATA_ROOT/sources" "$DATA_ROOT/builds" "$DATA_ROOT/published" "$DATA_ROOT/covers" "$DATA_ROOT/logs" "$DATA_ROOT/trash"
echo "持久化目录已准备完成。将 Release 文件放入 /opt/microbio-lab，配置 .env 后运行 docker compose up -d。"
