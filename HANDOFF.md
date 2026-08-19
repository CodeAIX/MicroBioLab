# MicroBioLab 维护交接

本文件供新的 Codex 会话、其他 Agent 或人工维护者快速接手。开始任何修改前先完整阅读本文件、`README.md`、`README-VPS.md`、`SECURITY.md` 和 `CHANGELOG.md`。

## 1. 项目快照

- 仓库：`https://github.com/CodeAIX/MicroBioLab`
- 可见性：Public
- 默认分支：`main`
- 当前发布：`v1.2.0`
- 发布源码提交：`6584d75c30d8abd9c9d4af9e5f1b9b546962e381`
- GitHub Release：`https://github.com/CodeAIX/MicroBioLab/releases/tag/v1.2.0`
- 主镜像：`ghcr.io/codeaix/microbio-lab-app:v1.2.0`
- Builder 镜像：`ghcr.io/codeaix/microbio-lab-builder:v1.2.0`
- 镜像架构：`linux/amd64`、`linux/arm64`
- 许可证：MIT
- Node.js：24+
- PostgreSQL：17
- 生产部署：Docker Compose + Cloudflare Tunnel，无宿主机反向代理

v1.2.0 已验证的发布状态：

```text
main CI：    https://github.com/CodeAIX/MicroBioLab/actions/runs/32202513867（success）
Release CI： https://github.com/CodeAIX/MicroBioLab/actions/runs/32202715637（success）
App index：  sha256:3b55bd5f632008d75a31d18eb264d43438ec23b1f7e21cf86474bcfd9faf55f0
Builder：    sha256:af63bd9d47a7d2af848f99073e488fa549da848c9568504973aefbfe0ccb748a
Release tar.gz SHA256：7d855194c2424fcccfe5724d245e74e70ff7d635867ff03988f60904d29b2ffb
```

v1.1.2 已验证的历史发布状态：

```text
main CI：    https://github.com/CodeAIX/MicroBioLab/actions/runs/31952285126（success）
Release CI： https://github.com/CodeAIX/MicroBioLab/actions/runs/31952425584（success）
App index：  sha256:f3f37ff17e0cca95dcc4528be2639b558f1f7e61783ffbcf97006256c54835da
Builder：    sha256:68b3ac23732c797ac9512e27ff9c87f8bcac9d9e5337a9159d38dfe737f26333
```

v1.2.0 两个镜像均已用匿名 Registry 请求验证为 HTTP 200，且 manifest 同时包含 `linux/amd64` 和 `linux/arm64`。Release 不是 draft/prerelease，下载后的资产已通过 `SHA256SUMS` 校验。

v1.2.0 增加知识点复习：数据库迁移 `003_knowledge_reviews.sql`、管理端 Markdown 上传/替换/删除、公共按需读取 API、学生详情页悬浮阅读与对应测试。功能提交和正式标签工作流均已完整通过。

业务域名：

```text
主平台：https://microbiolab.aixico.com
实验站：https://microbioexp.aixico.com
```

VPS 本机端口：

```text
127.0.0.1:18080 -> app 容器 8080
127.0.0.1:18081 -> exp-web 容器 8080
```

不要使用宿主机 8080，该端口已有其他容器占用。

## 2. 已知生产环境

用户最后提供的 VPS 基础环境：

```text
Ubuntu 24.04 系列
Docker 29.1.3
Docker Compose 2.40.3
git 2.43.0
curl 8.5.0
OpenSSL 3.0.13
部署目录：/opt/microbio-lab
数据目录：/srv/microbio-lab
```

最后一次已知健康检查中四个服务均正常。用户尚未提供 VPS 升级到 v1.2.0 后的输出，因此不能假设生产环境已经升级；新会话应先让用户执行：

```bash
cd /opt/microbio-lab
grep -E '^(PLATFORM_VERSION|BUILDER_VERSION)=' .env
docker compose ps
./scripts/healthcheck.sh
```

VPS 曾对 `compose.yaml` 的 Nginx tmpfs 权限做过本地修正；该修正已经进入上游 Compose。更新部署文件时仍应先备份 `/opt/microbio-lab`，不要直接覆盖未知的本地修改。

## 3. 产品现状

已实现：

- 管理员 Session 登录和 Argon2id 密码管理；
- 单文件 React JSX 上传，限制 10 MiB；封面图片独立限制 2 MiB；
- AST 静态安全检查，仅允许白名单 import；
- 隔离 Builder 构建，不执行上传源码、不运行 shell、不动态安装依赖；
- 实验源码、构建、发布和版本审计；
- 管理员预览、正式发布、下架、归档、回滚；
- 删除未发布版本；
- 归档后输入完整 Slug 永久删除实验及关联文件；
- 自定义教学顺序；
- 学生首页、实验介绍页和稳定运行地址；
- 二维码始终指向 `/experiments/<slug>/run`；
- 可选封面、自动主题色块、封面替换和删除；
- 实验级 Markdown 知识点复习，新建时可选上传、后续独立替换或删除；
- PostgreSQL 增量迁移；
- Docker Compose、备份、恢复、升级、回滚、卸载脚本；
- GitHub CI、GHCR 多架构镜像和 GitHub Release。

明确不在 V1 范围：

- 学生账户、班级、课程和成绩持久化；
- 多租户；
- LTI/SCORM；
- ZIP 实验包；
- 上传源码的动态依赖安装；
- 实验站根路径首页。

`https://microbioexp.aixico.com/` 返回 Nginx 404 是设计行为，不是故障。

上传限制的唯一共享数值定义在 `packages/shared/src/index.ts`：`JSX_MAX_UPLOAD_BYTES` 为 10 MiB，`COVER_MAX_UPLOAD_BYTES` 为 2 MiB。浏览器预检、Fastify multipart 入口和服务端存储校验必须同步使用这些常量；multipart 入口按较大的 JSX 上限接收，`saveCover` 必须继续对封面执行独立二次校验。

知识点上传上限同样由 `packages/shared/src/index.ts` 的 `KNOWLEDGE_REVIEW_MAX_UPLOAD_BYTES` 统一定义，目前为 512 KiB。内容保存在 PostgreSQL 的 `experiment_knowledge_reviews` 表中，不新增持久化目录；公共详情 API 只返回是否存在知识点，正文由 `/api/public/experiments/:slug/knowledge-review` 在用户打开悬浮页时按需读取。Markdown 渲染链必须继续保留 `rehype-sanitize`，不得直接信任上传的 HTML。

## 4. 代码与数据地图

```text
apps/api                 Fastify API、认证、管理员 CLI、迁移启动
apps/web                 React/Vite 管理端与学生端
services/builder         队列 Worker、AST 验证、esbuild 构建
packages/shared          Slug、版本格式、错误类型等共享代码
db/migrations            顺序执行的 PostgreSQL 增量迁移
infra/docker             App/Builder Dockerfile
infra/exp-nginx          只读实验静态站配置
scripts                  安装、健康、备份、恢复、升级、回滚、卸载
tests/integration        真实 API/Builder/发布闭环
tests/e2e                Playwright 浏览器测试
samples                  永久测试 fixture
```

生产数据：

```text
/srv/microbio-lab/postgres       PostgreSQL 数据
/srv/microbio-lab/sources        原始 JSX 与 source.json
/srv/microbio-lab/builds         不可变构建结果
/srv/microbio-lab/published      已发布静态实验
/srv/microbio-lab/covers         实验封面
/srv/microbio-lab/backups        完整备份
/srv/microbio-lab/logs           应用日志目录
```

数据库迁移规则：

- 文件名使用递增前缀，例如下一次使用 `004_feature.sql`；
- 已发布迁移绝不修改或重命名；
- 每个迁移由 `schema_migrations` 记录并在独立事务中执行；
- 应用启动时持有 PostgreSQL advisory lock 后迁移；
- 新迁移必须通过从空库安装和旧库升级两种测试。

## 5. 必须保持的安全边界

- Builder 不得挂载 Docker socket；
- Builder 的 `backend` 网络必须保持 `internal: true`；
- Builder 只读挂载 `sources`，只写 `builds`/`logs`；
- 上传 JSX 不得触发 `npm install` 或任意 shell；
- 实验 iframe 与管理平台保持不同 Origin；
- 实验静态站只提供 `/e/` 和 `/healthz`；
- 发布目录版本保持不可变；
- 管理 Session 保持 host-only、HttpOnly、Secure、SameSite=Lax；
- 所有删除路径必须经过 `safeRelativePath` 或固定目录验证；
- 默认卸载不得删除 `/srv/microbio-lab`；
- `.env`、数据库、密码、Session Secret 和 GitHub Token 不得提交。

## 6. 本地工作区注意事项

平台仓库当前位于：

```text
/Users/x/Agent/MicroBioLab/MicroBioLab-platform
```

实验包位于同级用户资产目录：

```text
/Users/x/Agent/MicroBioLab/MicroBioLab-JSX/JSX/<实验名称>/
```

该目录中的 JSX、`知识点复习.md`、设计方案和实验简介都属于用户资产。除非用户明确要求，否则不得修改、删除或打入平台仓库/发布包。平台自动化测试固定使用 `samples/enterobacteria/App.jsx` 与 `samples/enterobacteria/KnowledgeReview.md`，不要用真实教学资产替换测试 fixture。每次提交前使用 `git status --short`，只暂存本任务文件。

`/Users/x/Agent/MicroBioLab-artifacts` 中的 v1.1.1 离线包是只读历史备份。用户已明确要求后续版本不再制作、更新或维护本地离线包；发布在线版本时不要改动该目录。

## 7. 新维护会话的启动顺序

```bash
cd /Users/x/Agent/MicroBioLab/MicroBioLab-platform
git status --short
git remote -v
git fetch --tags origin
git log -5 --oneline --decorate
node --version
npm --version
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

本机可能没有 Docker。没有 Docker 时只能完成静态检查和单元测试；真实 PostgreSQL、Compose、Builder、Playwright 和持久化验证必须交给 GitHub CI，不要声称本地已运行容器测试。

## 8. 变更与测试要求

普通代码变更至少执行：

```bash
npm audit --audit-level=high
npm run lint
npm run typecheck
npm test
npm run build
bash -n scripts/*.sh tests/integration/*.sh
git diff --check
```

涉及以下内容时必须增加或更新 Docker 集成/E2E：

- 数据库迁移；
- 上传、构建、预览或发布；
- Session、Origin、CSP 或 iframe；
- 文件删除、封面、版本或排序；
- Compose 权限、只读文件系统、tmpfs、网络；
- 升级、备份、恢复或卸载脚本。

GitHub CI 成功标准：

- 依赖审计无 high/critical 漏洞；
- lint、类型检查、单元测试和所有构建通过；
- 生产 Compose 可解析；
- 两个自有镜像可构建；
- 样例上传、构建、发布闭环通过；
- Playwright 全部通过；
- App/Builder 重启后已发布实验仍可访问。

## 9. 发布流程

1. 更新 `CHANGELOG.md`、`.env.example`、README、HANDOFF 和构建文档中的版本号；
2. 本地执行全部非 Docker 检查；
3. 提交并推送 `main`；
4. 等待 `main` CI 全绿；
5. 使用新的版本号创建 annotated tag，例如 `NEXT_VERSION="v1.2.0"` 后执行 `git tag -a "$NEXT_VERSION" -m "MicroBio Lab $NEXT_VERSION"`；
6. 推送标签，等待 Release 工作流；
7. 验证 GitHub Release 不是 draft/prerelease；
8. 使用未登录请求验证两个 GHCR manifest 返回 HTTP 200；
9. 确认 manifest 同时包含 `amd64`、`arm64`；
10. 再给用户生产升级命令。

不要移动或覆盖已经发布的 tag，也不要静默替换 Release 资产。影响部署、运行命令或 Release 分发内容的文档/脚本修正应发布新的 patch 版本；仅记录既有发布结果的维护元数据可以只提交到 `main`，但不得回写旧 Release。

v1.1.2 Release 资产 `microbio-lab-v1.1.2.tar.gz` 的 SHA256 为 `be35549fee79151c57a7fe0b6c9f6f3c09f6b77461deadcde5e774bdcb4e59e0`。该值只用于验证既有不可变资产；后续 `main` 上的文档更新不会回写或替换 v1.1.2 Release。

v1.2.0 Release 资产 `microbio-lab-v1.2.0.tar.gz` 的 SHA256 为 `7d855194c2424fcccfe5724d245e74e70ff7d635867ff03988f60904d29b2ffb`。发布后维护元数据只提交到 `main`，不得回写或替换 v1.2.0 Release。

## 10. 运维原则

- 生产升级优先使用明确的 `vX.Y.Z`，不要用 `latest`；
- 更新镜像时 App 和 Builder 必须使用同一版本；
- 标准升级先更新 Release 中的部署文件，再运行目标版本的 `upgrade.sh`；
- 每次升级和回滚先备份；
- 回滚脚本不回退数据库迁移；精确回退使用升级前数据库备份；
- 备份必须包含 database、sources、builds、published、covers 和 SHA256SUMS；
- 备份只有复制到异机并验证恢复后才算可靠；
- 不要在 VPS 安装额外 Nginx，Cloudflare Tunnel 直接连接 18080/18081。

## 11. 历史故障与回归点

- `v1.0.1`：Nginx 非 root 用户无法写 tmpfs 缓存；Compose 现已设置 UID/GID/mode；
- `v1.0.2`：管理员预览 iframe 的认证资产被拦截；预览 token 与回归测试不可删除；
- `v1.0.3`：异步上传后表单节点卸载导致读取 `reset`；必须在 await 前保存 form 引用；
- `v1.0.4`：超大 multipart 封面显示 INTERNAL_ERROR；必须保持稳定上传错误映射；
- `v1.1.0`：教学排序、介绍页、二维码、无封面背景和删除管理；
- `v1.1.1`：运维脚本、完整备份、离线方案和维护交接。
- `v1.1.2`：JSX 上传上限提高到 10 MiB；本地 v1.1.1 离线包转为只读历史备份。
- `v1.2.0`：实验级 Markdown 知识点复习、管理端维护、学生详情页悬浮阅读与安全按需渲染。

## 12. 凭据与外部状态

- 仓库由 GitHub 账户 `CodeAIX` 管理；
- 仓库和 GHCR Package 都应保持 Public；
- GitHub Actions 使用最小权限 `GITHUB_TOKEN`，仓库中没有 PAT；
- 不要在 HANDOFF、日志、Issue 或提交中记录管理员密码、数据库密码或 Session Secret；
- 当前会话不能直接登录 VPS，所有 VPS 状态以用户粘贴的命令输出为准。

如果本文件与代码冲突，以经过测试的代码和最新 Release 为准，并在修正代码的同时更新本文件。
