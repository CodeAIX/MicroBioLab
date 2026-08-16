# MicroBioLab 离线包使用说明

本离线包适用于 `linux/amd64`（`x86_64`）VPS，包含 MicroBioLab `v1.1.1` 源码、部署文件和运行所需的四个 Docker archive。

## 1. 校验

```bash
sha256sum -c SHA256SUMS
cd 最新版镜像
sha256sum -c SHA256SUMS
```

macOS 可以使用：

```bash
shasum -a 256 -c SHA256SUMS
```

## 2. 导入镜像

```bash
cd 最新版镜像
for IMAGE_ARCHIVE in *.tar; do
  sudo docker load -i "$IMAGE_ARCHIVE"
done
sudo docker image ls | grep -E 'microbio-lab|postgres|nginx'
```

应包含：

```text
ghcr.io/codeaix/microbio-lab-app:v1.1.1
ghcr.io/codeaix/microbio-lab-builder:v1.1.1
postgres:17-alpine
nginx:1.27-alpine
```

## 3. 安装部署文件

```bash
sudo install -d /opt/microbio-lab
sudo cp -a 部署文件/. /opt/microbio-lab/
cd /opt/microbio-lab
sudo ./scripts/install.sh
```

按照 `部署文件/README-VPS.md` 的配置章节创建 `.env`。保持：

```text
GHCR_OWNER=codeaix
PLATFORM_VERSION=v1.1.1
BUILDER_VERSION=v1.1.1
APP_PORT=18080
EXP_PORT=18081
```

启动：

```bash
cd /opt/microbio-lab
sudo docker compose config --quiet
sudo docker compose up -d
sudo ./scripts/healthcheck.sh
```

离线启动不要执行 `docker compose pull`，否则 Docker 会尝试访问远程 Registry。

## 4. 源码重建

`镜像源码` 是对应 `v1.1.1` 镜像的完整 Git 导出，不包含 Git 历史和秘密。详细构建命令见包根目录 `构建方案.md`。

## 5. 安全说明

- 离线包不包含生产 `.env`、数据库或管理员密码；
- 必须在目标 VPS 重新生成数据库密码与 Session Secret；
- 本包不能代替 `/srv/microbio-lab/backups` 中的生产数据备份；
- `linux/amd64` 镜像不能用于仅支持 `linux/arm64` 的 VPS。
