#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "请使用 sudo 运行 install-management-command.sh" >&2
  exit 1
fi

PROJECT_DIR="/opt/microbio-lab"
TARGET="$PROJECT_DIR/scripts/manage.sh"
LINK="/usr/local/bin/mbl"
LEGACY_LINK="/usr/local/bin/microbio"

if [[ ! -x "$TARGET" ]]; then
  echo "缺少可执行维护脚本：$TARGET" >&2
  exit 1
fi

if [[ -e "$LINK" || -L "$LINK" ]]; then
  if [[ -L "$LINK" && "$(readlink "$LINK")" == "$TARGET" ]]; then
    if [[ -L "$LEGACY_LINK" && "$(readlink "$LEGACY_LINK")" == "$TARGET" ]]; then
      unlink "$LEGACY_LINK"
      echo "已移除旧维护入口：$LEGACY_LINK"
    fi
    echo "维护命令已安装：$LINK"
    exit 0
  fi
  echo "拒绝覆盖已有命令：$LINK" >&2
  exit 1
fi

install -d -m 0755 /usr/local/bin
ln -s "$TARGET" "$LINK"
if [[ -L "$LEGACY_LINK" && "$(readlink "$LEGACY_LINK")" == "$TARGET" ]]; then
  unlink "$LEGACY_LINK"
  echo "已移除旧维护入口：$LEGACY_LINK"
fi
echo "维护命令安装完成；运行 sudo mbl 打开菜单。"
