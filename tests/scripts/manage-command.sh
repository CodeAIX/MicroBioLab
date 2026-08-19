#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_ROOT="$(mktemp -d)"

cleanup() {
  if [[ -n "${TEST_ROOT:-}" && -d "$TEST_ROOT" && "$TEST_ROOT" == "${TMPDIR:-/tmp}"/* ]]; then
    rm -rf -- "$TEST_ROOT"
  fi
}
trap cleanup EXIT

mkdir -p "$TEST_ROOT/deploy/scripts" "$TEST_ROOT/bin"
cp "$REPO_DIR/compose.yaml" "$TEST_ROOT/deploy/compose.yaml"
cp "$REPO_DIR/.env.example" "$TEST_ROOT/deploy/.env"
cp "$REPO_DIR/scripts/"*.sh "$TEST_ROOT/deploy/scripts/"
cp "$REPO_DIR/tests/scripts/fixtures/docker" "$TEST_ROOT/bin/docker"

export MBL_PROJECT_DIR="$TEST_ROOT/deploy"
export DOCKER_LOG="$TEST_ROOT/docker.log"
export PATH="$TEST_ROOT/bin:$PATH"
touch "$DOCKER_LOG"

HELP_OUTPUT="$($TEST_ROOT/deploy/scripts/manage.sh help)"
[[ "$HELP_OUTPUT" == *"MicroBio Lab 维护命令"* ]]
[[ "$HELP_OUTPUT" == *"mbl uninstall"* ]]
[[ "$HELP_OUTPUT" == *"mbl purge"* ]]
[[ "$HELP_OUTPUT" == *"mbl storage"* ]]

BOOTSTRAP_HELP="$($REPO_DIR/scripts/bootstrap.sh --help)"
[[ "$BOOTSTRAP_HELP" == *"sudo bash bootstrap.sh"* ]]

VERSION_OUTPUT="$($TEST_ROOT/deploy/scripts/manage.sh version)"
[[ "$VERSION_OUTPUT" == *"平台版本：v1.4.0"* ]]
[[ "$VERSION_OUTPUT" == *"Builder： v1.4.0"* ]]

"$TEST_ROOT/deploy/scripts/manage.sh" status
[[ "$(tail -n1 "$DOCKER_LOG")" == "compose ps" ]]

if "$TEST_ROOT/deploy/scripts/manage.sh" logs unknown >/dev/null 2>&1; then
  echo "非法日志服务未被拒绝" >&2
  exit 1
fi

BEFORE_STOP="$(wc -l < "$DOCKER_LOG")"
if printf 'NO\n' | "$TEST_ROOT/deploy/scripts/manage.sh" stop >/dev/null 2>&1; then
  echo "取消停止操作时应返回非零状态" >&2
  exit 1
fi
[[ "$(wc -l < "$DOCKER_LOG")" == "$BEFORE_STOP" ]]

printf 'STOP\n' | "$TEST_ROOT/deploy/scripts/manage.sh" stop >/dev/null
[[ "$(tail -n1 "$DOCKER_LOG")" == "compose stop" ]]

BEFORE_UNINSTALL="$(wc -l < "$DOCKER_LOG")"
if printf 'NO\n' | "$TEST_ROOT/deploy/scripts/manage.sh" uninstall >/dev/null 2>&1; then
  echo "取消卸载操作时应返回非零状态" >&2
  exit 1
fi
[[ "$(wc -l < "$DOCKER_LOG")" == "$BEFORE_UNINSTALL" ]]

printf 'UNINSTALL\n' | "$TEST_ROOT/deploy/scripts/manage.sh" uninstall >/dev/null
[[ "$(tail -n1 "$DOCKER_LOG")" == "compose down --remove-orphans" ]]

BEFORE_PURGE="$(wc -l < "$DOCKER_LOG")"
if printf 'NO\n' | "$TEST_ROOT/deploy/scripts/manage.sh" purge >/dev/null 2>&1; then
  echo "取消永久删除时应返回非零状态" >&2
  exit 1
fi
[[ "$(wc -l < "$DOCKER_LOG")" == "$BEFORE_PURGE" ]]

if printf 'I-HAVE-OFFSITE-BACKUP\nNO\n' | "$TEST_ROOT/deploy/scripts/manage.sh" purge >/dev/null 2>&1; then
  echo "第二次取消永久删除时应返回非零状态" >&2
  exit 1
fi
[[ "$(wc -l < "$DOCKER_LOG")" == "$BEFORE_PURGE" ]]

if "$TEST_ROOT/deploy/scripts/manage.sh" </dev/null >/dev/null 2>&1; then
  echo "非交互终端不应进入菜单" >&2
  exit 1
fi

echo "mbl maintenance command tests passed"
