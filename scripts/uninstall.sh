#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"
REMOVE_IMAGES=false
PURGE_DATA=false
usage() { echo "用法：$0 [--remove-images] [--purge-data]"; }
for ARGUMENT in "$@"; do
  case "$ARGUMENT" in
    --remove-images) REMOVE_IMAGES=true ;;
    --purge-data) PURGE_DATA=true ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 1 ;;
  esac
done

if [[ ! -f .env ]]; then echo "缺少 $PROJECT_DIR/.env" >&2; exit 1; fi
set -a; source .env; set +a
if [[ "$PURGE_DATA" == true ]]; then
  if [[ "${DATA_ROOT:-}" != "/srv/microbio-lab" ]]; then echo "拒绝清理非标准目录" >&2; exit 1; fi
  read -r -p "这将永久删除 /srv/microbio-lab。输入 PURGE-MICROBIO-LAB：" CONFIRM
  if [[ "$CONFIRM" != "PURGE-MICROBIO-LAB" ]]; then echo "已取消，平台和数据均未更改"; exit 1; fi
fi
docker compose down --remove-orphans

if [[ "$REMOVE_IMAGES" == true ]]; then
  OWNER="${GHCR_OWNER,,}"
  for REPOSITORY in "ghcr.io/$OWNER/microbio-lab-app" "ghcr.io/$OWNER/microbio-lab-builder"; do
    mapfile -t IMAGE_REFERENCES < <(docker image ls "$REPOSITORY" --format '{{.Repository}}:{{.Tag}}' | grep -v ':<none>$' | sort -u)
    if ((${#IMAGE_REFERENCES[@]})); then docker image rm "${IMAGE_REFERENCES[@]}" || true; fi
  done
  echo "MicroBio Lab 的 App/Builder 本地镜像已清理；共享的 PostgreSQL/Nginx 镜像未删除。"
fi

if [[ "$PURGE_DATA" == false ]]; then
  echo "平台容器和网络已移除，$DATA_ROOT 数据与 $PROJECT_DIR 配置均已保留。"
  exit 0
fi
rm -rf -- /srv/microbio-lab
echo "永久数据已删除，无法从本机恢复；部署配置仍保留在 $PROJECT_DIR。"
