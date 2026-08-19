# 医学微生物学虚拟仿真实验平台

可部署到普通 Linux VPS 的医学微生物学虚拟仿真实验平台，用于安全上传、检查、构建、预览、发布和版本化管理单文件 React JSX 实验，并为每个实验配置 Markdown 知识点复习。平台软件与实验资产完全解耦；发布后的 `v000001` 等目录保持不可变，回滚只切换数据库中的生效版本。

当前稳定版：[`v1.5.0`](https://github.com/CodeAIX/MicroBioLab/releases/tag/v1.5.0)

主要能力：

- 隔离检查与构建 JSX，不执行上传源码、不开放动态依赖安装；
- 不可变版本、预览、发布、下架、归档和回滚；
- 教学顺序、学生首页、实验介绍页、稳定运行地址和二维码；
- 实验级 Markdown 知识点复习、按需加载的悬浮阅读页；
- 按 Slug 从目录及子目录批量预检、构建和整体发布 JSX；
- 可选封面、自动主题背景、实验删除与安全批量清理未发布版本；
- 管理端批量更新弹窗与实验详情页采用更紧凑、清晰的布局，列表仅显示当前生效版本的精确发布时间；
- Docker Compose、完整备份/恢复、升级/回滚和分级卸载；
- 公开 GHCR 多架构镜像，可匿名拉取。

## 快速部署

```bash
docker pull ghcr.io/codeaix/microbio-lab-app:v1.5.0
docker pull ghcr.io/codeaix/microbio-lab-builder:v1.5.0
```

镜像只负责 App/Builder，完整部署还需要仓库中的 `compose.yaml`、`.env`、PostgreSQL 和实验静态站。请按 [VPS 部署与运维](README-VPS.md) 完成安装，不要直接手写 `docker run`。

已安装 Docker Engine 与 Compose Plugin 的全新 VPS 可下载不可变标签中的引导式部署脚本；脚本会继续下载并校验正式 Release，而不是直接使用 `main`：

```bash
INSTALL_VERSION="v1.5.0"
curl -fL "https://raw.githubusercontent.com/CodeAIX/MicroBioLab/${INSTALL_VERSION}/scripts/bootstrap.sh" -o /tmp/microbio-bootstrap.sh
sudo bash /tmp/microbio-bootstrap.sh "$INSTALL_VERSION"
```

维护与二次构建：

- [VPS 安装、升级、维护、备份、恢复和卸载](README-VPS.md)
- [源码与多架构镜像构建方案](构建方案.md)
- [新会话/其他 Agent 维护交接](HANDOFF.md)
- [安全边界与威胁模型](SECURITY.md)

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
scripts              引导部署、维护菜单、升级、备份、恢复、分级卸载
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

该流程真实上传 `samples/enterobacteria/App.jsx` 和知识点 Markdown，等待 Builder、发布、检查公共 API、无封面创建、教学排序和归档恢复，并覆盖目录批量预检、批量构建、整体发布、安全批量清理。Playwright 继续检查介绍页、知识点悬浮阅读、二维码、实验 iframe 和管理操作。

## 环境变量

从 `.env.example` 开始。必须修改 `POSTGRES_PASSWORD`、`DATABASE_URL`、域名和 `SESSION_SECRET`：

```bash
openssl rand -hex 32
```

生产环境保持 `SESSION_SECURE=true`。`PLATFORM_ORIGIN` 必须精确等于管理平台 HTTPS Origin；Session Cookie 是 host-only、HttpOnly、Secure、SameSite=Lax，不使用父域 Cookie。

## JSX V1 合同

- 单个 UTF-8 `.jsx`，最大 10 MiB，恰好一个 default export。
- 上传路径始终由 UUID 生成，原文件和 SHA256 永久保留。
- V1 源码 import 白名单只有 `react`；Builder 内置 `react-dom` 仅用于 wrapper。
- 禁止 Node 内置模块、`require`、动态 import、`eval`、`Function`、`fetch`、XHR、WebSocket、Worker、Beacon 和 Service Worker。
- 允许 Google Fonts 域名并产生 warning；其他远程连接由 AST 和实验 CSP 双重阻止。
- 上传代码绝不会触发 `npm install`。

构建错误返回稳定代码，例如 `JSX_PARSE_ERROR`、`IMPORT_NOT_ALLOWED`、`SECURITY_BLOCKED`、`BUILD_FAILED`，后台展示中文说明和技术细节。

## 知识点复习

- 新建实验时可选上传实验包中的 UTF-8 `知识点复习.md`，最大 512 KiB；
- 知识点属于实验本身，不随 JSX 版本发布或回滚，管理端可独立替换和删除；
- 学生实验介绍页仅在已配置内容时显示“知识点复习”，点击后按需加载；
- 支持常用 Markdown、GFM 表格、代码块及 `<details>/<summary>` 折叠答案；原始 HTML 经过白名单清洗后才渲染；
- 内容存储在 PostgreSQL，现有数据库备份与恢复流程会自动包含知识点。

## 批量更新与版本清理

- 在“实验管理”点击“批量更新 JSX”，选择包含实验包的目录；浏览器会递归读取子目录中的 `.jsx`；
- 文件名使用 `<slug>-vsim.jsx` 或 `<slug>.jsx`。预检会列出无匹配、重复、内容未变和历史版本已存在的文件，只有“可更新”项能够提交；
- 每批最多 100 个文件、总计 100 MiB，单个 JSX 仍不得超过 10 MiB；文件上传后各自进入隔离 Builder；
- 全部构建成功后才出现“一次性发布”。发布会锁定并复核所有模块，在一个数据库事务中整体切换；任一失败或期间发生单独发布，线上版本均不会被本批次部分替换；
- “清理未发布版本”只列出非当前、从未发布且不在构建中的版本，并显示预计释放空间。发布过的历史版本继续保留，确保可以回滚；
- `sudo mbl storage` 可查看源码、构建、已发布资产和本机备份的宿主机占用。

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

实验第一次发布后 Slug 锁定。发布旧版本就是回滚，不重建也不删除新版本。默认管理动作是下架或归档；永久删除要求先归档并输入完整 Slug。当前版本和发布过的历史版本不能单独或批量删除；从未发布且已停止构建的非当前版本可以清理。

学生首页按后台保存的教学顺序展示。点击实验先进入介绍页，正式实验使用稳定地址 `/experiments/<slug>/run`；二维码也指向该地址，因此后续发布新版不需要重新制作二维码。封面图片可选，不上传时由 Slug 稳定生成主题色块；后台可随时替换或删除封面。

## CI 与 GHCR

`.github/workflows/ci.yml` 在 push/PR 上运行依赖审计、lint、类型检查、单元/集成测试、所有构建、生产 Compose 校验、两个 Docker 镜像构建、样例闭环、Playwright 和重启持久性检查。

推送 `v*` 标签后，`release.yml` 在完整 CI 通过后发布 amd64/arm64 镜像：

```text
ghcr.io/<owner>/microbio-lab-app:v1.5.0
ghcr.io/<owner>/microbio-lab-builder:v1.5.0
```

同时生成 `1.5`、`1`、`sha-*`，稳定版本更新 `latest`，并创建带 Compose、环境样例、基础设施、脚本和校验和的 GitHub Release。仓库不保存 PAT，Actions 使用最小权限 `GITHUB_TOKEN`。

两个 GHCR Package 均为公开镜像，可匿名拉取：

```bash
docker pull ghcr.io/codeaix/microbio-lab-app:v1.5.0
docker pull ghcr.io/codeaix/microbio-lab-builder:v1.5.0
```

## VPS 运维

完整复制粘贴步骤见 [README-VPS.md](README-VPS.md)。安装维护命令后，在 VPS 任意目录执行以下命令即可打开中文菜单：

```bash
sudo mbl
```

也可以直接使用参数模式：

```bash
sudo mbl status
sudo mbl health
sudo mbl logs app
sudo mbl backup
sudo mbl storage
sudo mbl upgrade v1.5.0
sudo mbl uninstall
sudo mbl help
```

全新安装和版本升级会自动注册该命令；也可运行 `sudo ./scripts/install-management-command.sh` 手动修复。回滚、停止、恢复和卸载仍保留显式确认保护。菜单把保留数据的卸载与永久清理分开；永久清理要求确认已有异机备份并再次输入固定确认词。

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
