# 医学微生物学虚拟仿真实验平台

可部署到普通 Linux VPS 的 V1 平台，用于安全上传、检查、构建、预览、发布和版本化管理单文件 React JSX 实验。平台软件与实验资产完全解耦；发布后的 `v000001` 等目录保持不可变，回滚只切换数据库中的生效版本。

## 架构

- `app`：Fastify API、React 中文管理端、公共学生入口。
- `builder`：独立队列 Worker，以 AST 静态检查 JSX，再通过 esbuild API 打包；不运行源码、不执行 shell、不安装上传依赖。
- `db`：PostgreSQL 17，保存管理员、服务端 Session、实验、版本、任务和审计记录。
- `exp-web`：只读 Nginx，仅公开已发布的静态实验。
- `backend` 是 Docker internal 网络；Builder 无公网、无 Docker socket。实验运行于独立 Origin 和 sandbox iframe。

目录说明：

```text
apps/api             Fastify API、迁移入口、管理员 CLI
apps/web             React/Vite 管理端和学生端
services/builder     JSX 验证器与构建 Worker
packages/shared      共享类型和约束
db/migrations        PostgreSQL 迁移
infra                Dockerfile 与实验 Nginx
samples              永久回归实验 fixture
scripts              安装、健康、升级、回滚、备份、恢复、卸载
```

## 本地开发

需要 Node.js 24、npm 和 PostgreSQL 17。

```bash
npm ci
cp .env.example .env
npm run build
npm test
```

开发数据库的默认连接为 `postgresql://microbio:microbio@127.0.0.1:5432/microbio`。分别运行：

```bash
npm run dev:api
npm run dev:web
npm run dev:builder
```

Vite 位于 `http://localhost:5173`，会代理 `/api` 与 `/preview` 到 8080。

## Docker 开发闭环

```bash
docker compose -f compose.dev.yaml up -d --build --wait
./tests/integration/sample-flow.sh
npm run test:e2e
docker compose -f compose.dev.yaml down -v
```

该流程真实上传 `samples/enterobacteria/App.jsx`，等待 Builder、发布、检查公共 API、归档恢复，并以 Playwright 检查实验 iframe 和管理员界面。

## 环境变量

从 `.env.example` 开始。必须修改 `POSTGRES_PASSWORD`、`DATABASE_URL`、域名和 `SESSION_SECRET`：

```bash
openssl rand -hex 32
```

生产环境保持 `SESSION_SECURE=true`。`PLATFORM_ORIGIN` 必须精确等于管理平台 HTTPS Origin；Session Cookie 是 host-only、HttpOnly、Secure、SameSite=Lax，不使用父域 Cookie。

## JSX V1 合同

- 单个 UTF-8 `.jsx`，最大 2 MiB，恰好一个 default export。
- 上传路径始终由 UUID 生成，原文件和 SHA256 永久保留。
- V1 源码 import 白名单只有 `react`；Builder 内置 `react-dom` 仅用于 wrapper。
- 禁止 Node 内置模块、`require`、动态 import、`eval`、`Function`、`fetch`、XHR、WebSocket、Worker、Beacon 和 Service Worker。
- 允许 Google Fonts 域名并产生 warning；其他远程连接由 AST 和实验 CSP 双重阻止。
- 上传代码绝不会触发 `npm install`。

构建错误返回稳定代码，例如 `JSX_PARSE_ERROR`、`IMPORT_NOT_ALLOWED`、`SECURITY_BLOCKED`、`BUILD_FAILED`，后台展示中文说明和技术细节。

## 管理员 CLI

生产容器内执行：

```bash
docker compose exec app node dist/cli/create-admin.js --email admin@example.com
docker compose exec app node dist/cli/change-password.js --email admin@example.com
docker compose exec app node dist/cli/list-admins.js
docker compose exec app node dist/cli/disable-admin.js --email admin@example.com
```

密码通过交互式终端读取，不写入 `.env`。密码至少 12 字符，使用 Argon2id。

## 数据与版本

生产数据固定在 `/srv/microbio-lab`；配置固定在 `/opt/microbio-lab`。原始 JSX 位于 `sources/<experiment_uuid>/<version_uuid>/App.jsx`，构建位于 `builds/<version_uuid>`，发布目录为 `published/<slug>/v000001`。发布先复制到临时目录、逐文件校验 manifest SHA256，再原子 rename 并更新数据库。

实验第一次发布后 Slug 锁定。发布旧版本就是回滚，不重建也不删除新版本。默认管理动作是下架或归档；永久删除要求先归档并输入完整 Slug，当前生效版本不能单独删除。

## CI 与 GHCR

`.github/workflows/ci.yml` 在 push/PR 上运行依赖审计、lint、类型检查、单元/集成测试、所有构建、生产 Compose 校验、两个 Docker 镜像构建、样例闭环、Playwright 和重启持久性检查。

推送 `v*` 标签后，`release.yml` 在完整 CI 通过后发布 amd64/arm64 镜像：

```text
ghcr.io/<owner>/microbio-lab-app:v1.0.2
ghcr.io/<owner>/microbio-lab-builder:v1.0.2
```

同时生成 `1.0`、`1`、`sha-*`，稳定版本更新 `latest`，并创建带 Compose、环境样例、基础设施、脚本和校验和的 GitHub Release。仓库不保存 PAT，Actions 使用最小权限 `GITHUB_TOKEN`。

两个 GHCR Package 均为公开镜像，可匿名拉取：

```bash
docker pull ghcr.io/codeaix/microbio-lab-app:v1.0.2
docker pull ghcr.io/codeaix/microbio-lab-builder:v1.0.2
```

## VPS 运维

完整复制粘贴步骤见 [README-VPS.md](README-VPS.md)。常用命令：

```bash
./scripts/healthcheck.sh
./scripts/backup.sh
./scripts/upgrade.sh v1.1.0
./scripts/rollback.sh v1.0.0
./scripts/restore.sh /srv/microbio-lab/backups/2026-08-16_120000
./scripts/uninstall.sh
```

普通卸载绝不删除 `/srv/microbio-lab`；只有显式 `--purge-data` 和二次确认才永久清理。

## 安全与故障排查

威胁模型见 [SECURITY.md](SECURITY.md)。推荐由 Cloudflare Tunnel 将两个 HTTPS 域名分别连接到 `http://127.0.0.1:18080` 和 `http://127.0.0.1:18081`，无需在 VPS 安装反向代理。

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f builder
curl http://127.0.0.1:18080/health/ready
curl http://127.0.0.1:18081/healthz
```

构建失败先查看后台错误代码，再检查 Builder 日志。数据库无法就绪时检查 `.env` 中密码与 `DATABASE_URL` 是否一致。发布失败时检查 `/srv/microbio-lab/{builds,published}` 所有权（应用 UID 1000）和磁盘空间。

## V1 范围

V1 不含学生账户、班级课程、成绩持久化、多租户、LTI/SCORM、ZIP 上传或动态依赖安装。实验可在后续通过 `postMessage` SDK 上报事件，但 V1 不接收成绩。
