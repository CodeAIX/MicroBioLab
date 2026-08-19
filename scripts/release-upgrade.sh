#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]]; then
  echo "用法：$0 v1.3.0" >&2
  exit 1
fi
if [[ "${EUID}" -ne 0 ]]; then
  echo "标准升级需要更新 /opt/microbio-lab，请使用 sudo 运行" >&2
  exit 1
fi

TARGET_VERSION="$1"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
ARCHIVE="microbio-lab-${TARGET_VERSION}.tar.gz"
RELEASE_URL="https://github.com/CodeAIX/MicroBioLab/releases/download/${TARGET_VERSION}"
DOWNLOAD_DIR="$(mktemp -d)"

cleanup() { rm -rf -- "$DOWNLOAD_DIR"; }
trap cleanup EXIT

if [[ "$PROJECT_DIR" != "/opt/microbio-lab" || ! -f "$PROJECT_DIR/.env" ]]; then
  echo "标准升级只接受有效部署目录 /opt/microbio-lab" >&2
  exit 1
fi

echo "下载并校验 $TARGET_VERSION Release……"
curl -fL "$RELEASE_URL/$ARCHIVE" -o "$DOWNLOAD_DIR/$ARCHIVE"
curl -fL "$RELEASE_URL/SHA256SUMS" -o "$DOWNLOAD_DIR/SHA256SUMS"
(cd "$DOWNLOAD_DIR" && sha256sum -c SHA256SUMS)

while IFS= read -r entry; do
  case "$entry" in
    /*|..|../*|*/../*|*/..|.env|./.env)
      echo "Release 资产包含不安全路径：$entry" >&2
      exit 1
      ;;
  esac
done < <(tar -tzf "$DOWNLOAD_DIR/$ARCHIVE")

CONFIG_BACKUP="/opt/microbio-lab-config-$(date '+%Y%m%d-%H%M%S')"
cp -a "$PROJECT_DIR" "$CONFIG_BACKUP"
echo "部署文件备份：$CONFIG_BACKUP"

tar --no-same-owner -xzf "$DOWNLOAD_DIR/$ARCHIVE" -C "$PROJECT_DIR"
"$PROJECT_DIR/scripts/upgrade.sh" "$TARGET_VERSION"
echo "标准 Release 升级完成：$TARGET_VERSION"
