#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${MBL_PROJECT_DIR:-/opt/microbio-lab}"
SCRIPT_DIR="$PROJECT_DIR/scripts"
VERSION_PATTERN='^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$'

usage() {
  cat <<'EOF'
MicroBio Lab 维护命令

用法：
  mbl                         打开中文维护菜单
  mbl status                  查看容器状态
  mbl health                  执行健康检查
  mbl logs [服务]             跟踪日志（all/app/builder/exp-web/db）
  mbl version                 查看当前平台与 Builder 版本
  mbl backup                  创建完整备份
  mbl backups                 列出本机备份
  mbl storage                 查看在线资产与本机备份占用
  mbl start                   启动平台并检查健康状态
  mbl restart                 重启平台并检查健康状态
  mbl stop                    确认后停止平台
  mbl upgrade <vX.Y.Z>        从 GitHub Release 标准升级
  mbl rollback <vX.Y.Z>       确认后回滚镜像版本
  mbl restore <备份目录>      使用既有备份恢复
  mbl uninstall               卸载容器和网络，保留数据与镜像
  mbl uninstall --remove-images  同时删除平台镜像，仍保留数据
  mbl purge                   双重确认后永久删除平台数据
  mbl help                    显示帮助

推荐使用 sudo mbl，确保能够访问 Docker 和平台数据。
EOF
}

require_deployment() {
  if [[ ! -d "$PROJECT_DIR" || ! -f "$PROJECT_DIR/compose.yaml" || ! -f "$PROJECT_DIR/.env" ]]; then
    echo "未找到有效部署：$PROJECT_DIR" >&2
    echo "如使用非标准测试目录，可设置 MBL_PROJECT_DIR。" >&2
    exit 1
  fi
  cd "$PROJECT_DIR"
}

confirm() {
  local prompt="$1"
  local expected="$2"
  local answer
  read -r -p "$prompt" answer
  [[ "$answer" == "$expected" ]]
}

validate_version() {
  if [[ ! "$1" =~ $VERSION_PATTERN ]]; then
    echo "版本格式无效：$1；应类似 v1.5.0" >&2
    return 1
  fi
}

prompt_version() {
  local action="$1"
  local version
  read -r -p "请输入要${action}的版本（例如 v1.5.0）：" version
  validate_version "$version" || return 1
  printf '%s\n' "$version"
}

show_version() {
  local platform builder
  platform="$(sed -n 's/^PLATFORM_VERSION=//p' .env | head -n1)"
  builder="$(sed -n 's/^BUILDER_VERSION=//p' .env | head -n1)"
  echo "平台版本：${platform:-未配置}"
  echo "Builder： ${builder:-未配置}"
}

show_logs() {
  local service="${1:-all}"
  case "$service" in
    all) docker compose logs --tail=100 --follow ;;
    app|builder|exp-web|db) docker compose logs --tail=100 --follow "$service" ;;
    *) echo "未知服务：$service（可选 all/app/builder/exp-web/db）" >&2; return 1 ;;
  esac
}

list_backups() {
  local backup_root="/srv/microbio-lab/backups"
  if [[ ! -d "$backup_root" ]]; then
    echo "备份目录不存在：$backup_root"
    return 0
  fi
  local found=false
  while IFS= read -r backup; do
    found=true
    printf '%s\n' "$backup"
  done < <(find "$backup_root" -mindepth 1 -maxdepth 1 -type d ! -name '.partial-*' -print | sort -r)
  if [[ "$found" == false ]]; then echo "尚无备份。"; fi
}

show_storage() {
  local data_root
  data_root="$(sed -n 's/^DATA_ROOT=//p' .env | head -n1)"
  if [[ -z "$data_root" || ! -d "$data_root" ]]; then
    echo "数据目录不存在：${data_root:-未配置}" >&2
    return 1
  fi
  echo "数据目录：$data_root"
  for asset in postgres sources builds published covers backups; do
    if [[ -e "$data_root/$asset" ]]; then du -sh -- "$data_root/$asset"; fi
  done
  if [[ -d "$data_root/backups" ]]; then
    echo "本机备份数：$(find "$data_root/backups" -mindepth 1 -maxdepth 1 -type d ! -name '.partial-*' | wc -l | tr -d ' ')"
  fi
}

stop_platform() {
  if ! confirm "停止后平台将暂时不可访问。输入 STOP 继续：" "STOP"; then
    echo "已取消"
    return 1
  fi
  docker compose stop
  echo "平台已停止；永久数据未删除。"
}

rollback_platform() {
  local version="$1"
  validate_version "$version" || return 1
  if ! confirm "将备份数据并回滚镜像到 $version。输入 ROLLBACK 继续：" "ROLLBACK"; then
    echo "已取消"
    return 1
  fi
  "$SCRIPT_DIR/rollback.sh" "$version"
}

restore_backup() {
  local backup="$1"
  "$SCRIPT_DIR/restore.sh" "$backup"
}

uninstall_platform() {
  local remove_images="${1:-false}"
  local message="卸载平台容器和网络，永久数据与部署配置会保留。输入 UNINSTALL 继续："
  if [[ "$remove_images" == true ]]; then
    message="卸载平台容器和网络并删除 App/Builder 镜像，永久数据与配置会保留。输入 UNINSTALL 继续："
  fi
  if ! confirm "$message" "UNINSTALL"; then
    echo "已取消"
    return 1
  fi
  if [[ "$remove_images" == true ]]; then
    "$SCRIPT_DIR/uninstall.sh" --remove-images
  else
    "$SCRIPT_DIR/uninstall.sh"
  fi
}

purge_platform() {
  cat <<'EOF'
警告：此操作会永久删除 /srv/microbio-lab 中的数据库、实验源码、构建、发布文件、封面和本机备份。
请先把可恢复备份复制到另一台机器或对象存储。/opt/microbio-lab 部署配置会保留。
EOF
  if ! confirm "确认已有异机备份后输入 I-HAVE-OFFSITE-BACKUP：" "I-HAVE-OFFSITE-BACKUP"; then
    echo "已取消"
    return 1
  fi
  "$SCRIPT_DIR/uninstall.sh" --remove-images --purge-data
}

uninstall_menu() {
  local choice
  cat <<'EOF'
  1) 卸载容器和网络（保留数据、配置和镜像）
  2) 卸载并删除平台镜像（保留数据和配置）
  3) 永久删除全部平台数据（高风险）
  0) 返回
EOF
  read -r -p "请选择 [0-3]：" choice
  case "$choice" in
    1) uninstall_platform false ;;
    2) uninstall_platform true ;;
    3) purge_platform ;;
    0) return 0 ;;
    *) echo "无效选项"; return 1 ;;
  esac
}

run_command() {
  local command="${1:-menu}"
  shift || true

  case "$command" in
    menu) interactive_menu ;;
    status) docker compose ps ;;
    health) "$SCRIPT_DIR/healthcheck.sh" ;;
    logs) show_logs "${1:-all}" ;;
    version) show_version ;;
    backup) "$SCRIPT_DIR/backup.sh" ;;
    backups) list_backups ;;
    storage) show_storage ;;
    start)
      docker compose up -d
      "$SCRIPT_DIR/healthcheck.sh"
      ;;
    restart)
      docker compose restart
      "$SCRIPT_DIR/healthcheck.sh"
      ;;
    stop) stop_platform ;;
    upgrade)
      if [[ $# -ne 1 ]]; then echo "用法：mbl upgrade vX.Y.Z" >&2; return 1; fi
      validate_version "$1" || return 1
      "$SCRIPT_DIR/release-upgrade.sh" "$1"
      ;;
    rollback)
      if [[ $# -ne 1 ]]; then echo "用法：mbl rollback vX.Y.Z" >&2; return 1; fi
      rollback_platform "$1"
      ;;
    restore)
      if [[ $# -ne 1 ]]; then echo "用法：mbl restore /srv/microbio-lab/backups/<backup>" >&2; return 1; fi
      restore_backup "$1"
      ;;
    uninstall)
      if [[ $# -eq 0 ]]; then
        uninstall_platform false
      elif [[ $# -eq 1 && "$1" == "--remove-images" ]]; then
        uninstall_platform true
      else
        echo "用法：mbl uninstall [--remove-images]" >&2
        return 1
      fi
      ;;
    purge)
      if [[ $# -ne 0 ]]; then echo "用法：mbl purge" >&2; return 1; fi
      purge_platform
      ;;
    help|-h|--help) usage ;;
    *) echo "未知命令：$command" >&2; usage >&2; return 1 ;;
  esac
}

interactive_menu() {
  if [[ ! -t 0 ]]; then
    echo "非交互终端无法打开菜单；请使用 mbl help 查看参数模式。" >&2
    return 1
  fi

  local choice version service backup
  while true; do
    echo
    echo "====== MicroBio Lab 平台维护 ======"
    show_version
    cat <<'EOF'

  1) 查看容器状态
  2) 健康检查
  3) 查看实时日志
  4) 创建完整备份
  5) 查看备份列表
  6) 启动平台
  7) 重启平台
  8) 停止平台
 9) 升级平台
 10) 回滚镜像版本
 11) 从备份恢复
 12) 卸载或永久删除
 13) 查看存储占用
  0) 退出
EOF
    read -r -p "请选择 [0-13]：" choice
    echo
    case "$choice" in
      1) run_command status || true ;;
      2) run_command health || true ;;
      3)
        read -r -p "服务（all/app/builder/exp-web/db，默认 all）：" service
        echo "按 Ctrl+C 停止跟踪日志。"
        run_command logs "${service:-all}" || true
        ;;
      4) run_command backup || true ;;
      5) run_command backups || true ;;
      6) run_command start || true ;;
      7) run_command restart || true ;;
      8) run_command stop || true ;;
      9)
        version="$(prompt_version "升级")" && run_command upgrade "$version" || true
        ;;
      10)
        version="$(prompt_version "回滚到")" && run_command rollback "$version" || true
        ;;
      11)
        list_backups
        read -r -p "请输入完整备份目录：" backup
        [[ -n "$backup" ]] && run_command restore "$backup" || true
        ;;
      12) uninstall_menu || true ;;
      13) run_command storage || true ;;
      0) echo "已退出。"; return 0 ;;
      *) echo "无效选项，请重新选择。" ;;
    esac
  done
}

if [[ "${1:-}" == "help" || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_deployment
run_command "$@"
