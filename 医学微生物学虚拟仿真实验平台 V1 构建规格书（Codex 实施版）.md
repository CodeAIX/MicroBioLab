# 医学微生物学虚拟仿真实验平台 V1 构建规格书

## 0. 给 Codex 的总任务

请作为资深全栈工程师、DevOps 工程师和安全工程师，完整实现一个可部署到普通 Linux VPS 的：

**医学微生物学虚拟仿真实验平台（Microbiology Virtual Lab Platform）**

不要只生成脚手架、Demo 或伪代码。必须完成可以实际运行、测试、构建 Docker 镜像并部署的 V1 产品。

最终要求完成：

1. 完整 GitHub 仓库源码；
2. 前端管理平台；
3. Node.js 后端 API；
4. PostgreSQL 数据库；
5. 独立 JSX Builder；
6. 独立实验静态文件服务器；
7. Docker Compose；
8. GitHub Actions CI；
9. GitHub Actions 自动构建并发布 Docker 镜像到 GHCR；
10. VPS 安装文档；
11. 更新、备份、恢复、回滚脚本；
12. 管理员账户创建机制；
13. JSX 上传、检查、构建、预览、发布、版本管理、回滚、下架、归档和删除；
14. 使用提供的 `肠道杆菌鉴定虚拟仿真实验.jsx` 完成端到端测试；
15. 所有自动测试通过后才能视为完成。

不得将“未来可以实现”当作本次完成结果。

---

# 1. 产品目标

建立一个长期可维护的医学微生物学虚拟仿真实验平台。

核心使用流程：

```text
Claude Artifacts
       ↓
生成单文件 React JSX
       ↓
教师下载 JSX
       ↓
登录实验平台管理员后台
       ↓
新建实验 / 上传新版 JSX
       ↓
平台自动检查
       ↓
自动构建静态 Web App
       ↓
管理员预览
       ↓
发布
       ↓
学生通过浏览器访问
```

以后新增实验时：

**不修改平台源码、不重新编译整个平台、不重启整个服务器。**

实验必须作为独立模块存在。

---

# 2. 核心架构原则

必须严格遵守以下原则。

## 2.1 平台与实验完全解耦

平台负责：

- 管理员认证；
- 实验元数据；
- JSX 上传；
- 构建任务；
- 版本管理；
- 发布；
- 下架；
- 归档；
- 回滚；
- 日志；
- 将来保存学生成绩。

实验负责：

- 自己的 UI；
- 教学逻辑；
- 状态；
- 实验结果；
- 实验交互。

禁止将所有 JSX import 到主 React 项目以后重新 build 整个平台。

---

## 2.2 每个实验版本不可变

例如：

```text
enterobacteria
├── v000001
├── v000002
├── v000003
└── v000004
```

一个版本发布后：

**不允许原地修改其 source 或 dist。**

修改实验必须产生：

```text
v000005
```

发布只是修改：

```text
active_version_id
```

这样可以随时回滚。

---

## 2.3 永久保存原始 JSX

必须同时保存：

```text
source/App.jsx
```

和：

```text
dist/
```

不能只保存编译结果。

JSX 是主要教学资产。

---

## 2.4 不允许上传代码执行 npm install

这是安全红线。

绝对禁止：

```text
上传 JSX
↓
解析 import
↓
自动 npm install xxx
```

也禁止接受用户上传的：

```text
package.json
package-lock.json
node_modules
Dockerfile
shell script
```

V1 只接受：

```text
单个 .jsx 文件
```

需要的依赖必须预先包含在 Builder Docker 镜像中。

---

# 3. 推荐技术栈

固定采用以下架构，除非实现过程中发现重大兼容性问题并在 README 中说明原因。

## Frontend

```text
React
TypeScript
Vite
React Router
```

## Backend

```text
Node.js 24
TypeScript
Fastify
```

## Database

```text
PostgreSQL 17
```

## JSX 构建

```text
esbuild
@babel/parser 或等价 AST parser
```

## 密码

```text
Argon2id
```

如果 Argon2 在目标 Docker 架构产生明显构建问题，可改为经过可靠实现的 bcrypt，但必须记录原因。

## 部署

```text
Docker
Docker Compose
```

## CI/CD

```text
GitHub Actions
GitHub Container Registry / GHCR
```

## 包管理

使用：

```text
npm
package-lock.json
npm ci
```

不要依赖宿主机全局 npm 包。

---

# 4. 总体运行架构

```text
                         Internet
                            │
                            ▼
                   VPS Existing Proxy
                Nginx / Caddy / CF Tunnel
                      │             │
                      │             │
             lab.example.com   exp.lab.example.com
                      │             │
                      ▼             ▼
                127.0.0.1       127.0.0.1
                   :18080          :18081
                      │             │
      ┌───────────────┴─────────────┴───────────────┐
      │          Docker Compose: microbio-lab       │
      │                                             │
      │     ┌────────────┐       ┌────────────┐     │
      │     │    app     │       │  exp-web   │     │
      │     │ Web + API  │       │   Nginx    │     │
      │     └─────┬──────┘       └──────▲─────┘     │
      │           │                     │ read only  │
      │           │               published/        │
      │           │                                  │
      │     ┌─────▼──────┐                           │
      │     │ PostgreSQL │                           │
      │     └─────▲──────┘                           │
      │           │                                  │
      │     ┌─────┴──────┐                           │
      │     │  Builder   │                           │
      │     │ JSX→Web    │                           │
      │     └────────────┘                           │
      │                                             │
      └─────────────────────────────────────────────┘
```

---

# 5. Docker 服务

Compose 项目名固定：

```yaml
name: microbio-lab
```

不要为服务设置硬编码：

```yaml
container_name:
```

让 Compose 自己完成资源命名与隔离。

共四个服务：

```text
app
builder
exp-web
db
```

---

# 6. app 容器

app 同时提供：

```text
React 管理前端
+
Fastify API
```

前端生产 build 后由 Fastify 提供静态文件。

app 应监听容器内：

```text
8080
```

宿主机只绑定：

```text
127.0.0.1:18080
```

禁止：

```text
0.0.0.0:18080
```

默认直接暴露。

---

# 7. exp-web 容器

使用 Nginx，仅用于提供已经发布的实验静态资源。

监听：

```text
127.0.0.1:18081
```

只读挂载：

```text
/data/published
```

禁止访问：

```text
sources
builds
PostgreSQL
Docker socket
```

公开 URL：

```text
https://exp.lab.example.com/e/<slug>/v000001/
```

平台学生端：

```text
https://lab.example.com/experiments/<slug>
```

页面中通过 iframe 打开真正实验。

---

# 8. Builder 容器

Builder 是最重要的安全边界。

职责：

```text
读取 source JSX
↓
AST 检查
↓
import 检查
↓
安全检查
↓
esbuild 编译
↓
输出 dist
↓
生成 manifest
↓
更新 build job
```

Builder：

- 不暴露端口；
- 不连接公网；
- 只连接 Docker 内部网络；
- 不允许访问 Docker socket；
- root filesystem 尽量设为 read-only；
- 使用非 root 用户；
- cap_drop ALL；
- no-new-privileges；
- 设置 CPU、RAM、PID 限制；
- source 目录只读；
- build 目录可写；
- 不执行 npm install；
- 不执行上传 JSX；
- 不使用 `eval` 加载 JSX；
- 编译时不得运行用户源码。

Builder 只进行静态解析和 bundling。

---

# 9. Docker 网络

定义：

```text
frontend
backend
```

其中：

```yaml
backend:
  internal: true
```

连接关系：

```text
app
 ├── frontend
 └── backend

builder
 └── backend

db
 └── backend

exp-web
 └── frontend
```

Builder 不能直接访问互联网。

---

# 10. VPS 持久化目录

统一使用：

```text
/srv/microbio-lab
```

结构：

```text
/srv/microbio-lab/
├── postgres/
├── sources/
├── builds/
├── published/
├── covers/
├── logs/
├── backups/
└── trash/
```

程序部署文件：

```text
/opt/microbio-lab/
```

包含：

```text
compose.yaml
.env
scripts/
nginx/
README-VPS.md
```

严格区分：

```text
/opt/microbio-lab
=
程序配置

/srv/microbio-lab
=
永久数据
```

升级 Docker 镜像绝对不能删除 `/srv/microbio-lab`。

---

# 11. GitHub 仓库结构

建议：

```text
microbio-virtual-lab/
│
├── apps/
│   ├── web/
│   └── api/
│
├── services/
│   └── builder/
│
├── packages/
│   └── shared/
│
├── db/
│   └── migrations/
│
├── infra/
│   ├── exp-nginx/
│   │   ├── nginx.conf
│   │   └── default.conf.template
│   └── docker/
│       ├── Dockerfile.app
│       └── Dockerfile.builder
│
├── samples/
│   └── enterobacteria/
│       └── App.jsx
│
├── scripts/
│   ├── install.sh
│   ├── upgrade.sh
│   ├── rollback.sh
│   ├── backup.sh
│   ├── restore.sh
│   ├── uninstall.sh
│   └── healthcheck.sh
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
│
├── compose.yaml
├── compose.dev.yaml
├── .env.example
├── package.json
├── package-lock.json
├── README.md
├── LICENSE
└── SECURITY.md
```

使用 npm workspaces。

---

# 12. 实验源码存储结构

不要直接使用用户文件名作为服务器路径。

使用 UUID。

例如：

```text
sources/
└── <experiment_uuid>/
    └── <version_uuid>/
        ├── App.jsx
        └── source.json
```

source.json：

```json
{
  "schemaVersion": 1,
  "originalFilename": "xxx.jsx",
  "sha256": "...",
  "uploadedAt": "...",
  "uploadedBy": "..."
}
```

---

# 13. Builder 输出结构

```text
builds/
└── <version_uuid>/
    ├── index.html
    ├── assets/
    │   └── app-xxxxx.js
    └── manifest.json
```

manifest 至少记录：

```json
{
  "schemaVersion": 1,
  "experimentId": "...",
  "versionId": "...",
  "sourceSha256": "...",
  "builderVersion": "...",
  "builtAt": "...",
  "imports": ["react"],
  "warnings": [],
  "files": []
}
```

每个输出文件记录 SHA256。

---

# 14. 发布目录

发布后复制到：

```text
published/
└── <slug>/
    ├── v000001/
    ├── v000002/
    └── v000003/
```

一旦发布：

```text
published/<slug>/v000001
```

必须视为 immutable。

不要修改。

---

# 15. 不使用 current 软链接

学生访问平台：

```text
/experiments/enterobacteria
```

平台查询：

```text
active_version_id
```

得到：

```text
v000004
```

iframe URL：

```text
https://exp.example.com/e/enterobacteria/v000004/
```

这样旧版本 URL 永远可复现。

---

# 16. JSX V1 模块规范

V1 只接受：

```text
.jsx
```

最大大小：

```text
10 MiB
```

UTF-8。

要求：

```jsx
export default function App() {
  ...
}
```

或者其他形式的：

```jsx
export default App;
```

但必须恰好存在一个 default export React component。

---

# 17. V1 允许依赖

初始白名单：

```text
react
```

Builder 自身需要：

```text
react
react-dom
```

以后允许通过升级 Builder 镜像加入：

```text
lucide-react
framer-motion
recharts
```

但 V1 不要求支持这些。

绝不自动安装未知包。

如果 JSX 包含：

```jsx
import xxx from "unknown-package";
```

应返回：

```text
BUILD_BLOCKED

Dependency not allowed:
unknown-package
```

并在管理员界面明确展示。

---

# 18. JSX 禁止能力

AST 检查至少禁止：

```text
Node built-in modules
fs
child_process
net
tls
http
https
os
path
cluster
worker_threads
```

同时阻止或警告：

```text
dynamic import()
require()
eval()
new Function()
fetch()
XMLHttpRequest
WebSocket
EventSource
navigator.sendBeacon
Worker
SharedWorker
serviceWorker
```

真正的安全边界不能只依赖 AST。

必须同时依赖：

```text
独立 Origin
CSP
iframe sandbox
Docker Builder isolation
```

---

# 19. Google Fonts 特殊兼容

提供的首个测试 JSX 包含 Google Fonts CSS import。

V1 可以仅允许：

```text
https://fonts.googleapis.com
https://fonts.gstatic.com
```

除此之外禁止远程资源。

以后可以增加：

```text
“将 Google Fonts 本地化”
```

功能，但不属于 V1 必须项。

---

# 20. Experiment CSP

exp-web 应设置安全响应头。

核心 CSP 目标：

```text
default-src 'self'
connect-src 'none'
object-src 'none'
base-uri 'none'
img-src 'self' data: blob:
script-src 'self'
```

样式允许：

```text
'self'
'unsafe-inline'
https://fonts.googleapis.com
```

字体允许：

```text
'self'
data:
https://fonts.gstatic.com
```

禁止任意外部请求。

---

# 21. iframe 安全

平台中打开实验时使用：

```html
<iframe
  sandbox="allow-scripts allow-forms"
  referrerpolicy="no-referrer">
</iframe>
```

V1 不添加：

```text
allow-same-origin
allow-top-navigation
allow-popups
```

管理员预览同样使用 sandbox iframe。

---

# 22. Cookie 安全

管理员 Session Cookie 必须：

```text
HttpOnly
Secure（HTTPS生产环境）
SameSite=Lax
```

必须是：

```text
lab.example.com
```

的 host-only cookie。

绝对禁止设置：

```text
Domain=.example.com
```

避免实验子域获得平台 Cookie。

---

# 23. 管理员认证

V1 只实现：

```text
ADMIN
```

暂时不实现学生账户。

密码使用安全 Hash。

Session：

```text
server-side session
```

存数据库。

不要把权限 token 放：

```text
localStorage
```

---

# 24. 创建管理员

不要将初始管理员密码永久放进 `.env`。

实现 CLI：

```bash
docker compose exec app \
  node dist/cli/create-admin.js \
  --email admin@example.com
```

程序交互提示输入密码。

同时实现：

```bash
change-password
list-admins
disable-admin
```

CLI。

---

# 25. 数据库表

至少实现以下表。

## users

```text
id UUID
email
password_hash
role
is_active
created_at
updated_at
last_login_at
```

---

## sessions

```text
id UUID
user_id
token_hash
created_at
expires_at
last_seen_at
```

---

## experiments

```text
id UUID
slug
title
description
category
status
cover_path
active_version_id
created_by
created_at
updated_at
```

status：

```text
draft
published
hidden
archived
```

slug 一旦第一次正式发布：

**不得修改。**

---

## experiment_versions

```text
id UUID
experiment_id
version_number
status
source_filename
source_path
source_sha256
build_path
builder_version
build_warnings JSONB
created_by
created_at
built_at
published_at
```

version_number：

```text
1
2
3
...
```

UI 显示：

```text
v000001
```

---

## build_jobs

```text
id UUID
version_id
status
worker_id
created_at
started_at
finished_at
error_code
error_message
```

状态：

```text
queued
running
success
failed
```

---

## audit_logs

记录：

```text
登录
退出
创建实验
修改实验
上传版本
构建
发布
回滚
下架
归档
删除
创建管理员
```

字段：

```text
id
user_id
action
entity_type
entity_id
metadata JSONB
created_at
```

---

# 26. Builder Queue

API 接收到 JSX 后：

```text
保存 source
↓
写入 experiment_versions
↓
创建 build_jobs queued
```

Builder：

```text
轮询数据库
```

领取任务必须避免多个 Worker 同时领取。

使用 PostgreSQL：

```text
FOR UPDATE SKIP LOCKED
```

或等价可靠机制。

V1 可以只有一个 Builder。

---

# 27. JSX Build Wrapper

Builder 自动创建内部临时 entry：

```jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

生成标准：

```html
<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport"
        content="width=device-width,initial-scale=1.0">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./assets/app.js"></script>
</body>
</html>
```

---

# 28. 构建过程中不要执行 Shell 拼接

不要：

```javascript
exec("esbuild " + userInput)
```

使用：

```text
esbuild JavaScript API
```

用户输入不能成为：

```text
shell command
filesystem path
environment variable name
```

---

# 29. 管理后台 V1 页面

至少实现：

```text
/login
/dashboard
/experiments
/experiments/new
/experiments/:id
/experiments/:id/versions
/admin/audit
```

---

# 30. Dashboard

显示：

```text
实验总数
已发布
草稿
已归档
构建失败
最近更新
最近操作
```

---

# 31. 实验列表

卡片显示：

```text
封面
标题
分类
slug
状态
当前版本
更新时间
```

操作：

```text
预览
编辑
上传新版
版本历史
下架
归档
```

---

# 32. 创建实验

字段：

```text
标题 *
Slug *
分类
简介
封面
JSX *
```

上传后：

```text
创建实验
↓
创建 v000001
↓
开始构建
```

---

# 33. Build 页面

实时轮询：

```text
QUEUED
BUILDING
SUCCESS
FAILED
```

显示：

```text
Source SHA256
Builder Version
Build time
Imports
Warnings
Error
```

成功后：

```text
[预览]
[发布]
```

---

# 34. 版本管理

例如：

```text
v000004     当前
v000003     已发布历史版本
v000002
v000001
```

操作：

```text
预览
查看源码信息
发布此版本
删除未发布版本
```

“回滚”本质为：

```text
把旧版本设为 active_version_id
```

不得重新 build 老版本。

---

# 35. 发布必须原子化

基本流程：

```text
确认 version build success
↓
复制 build → published/<slug>/<version>
↓
校验文件 SHA256
↓
DB transaction
↓
active_version_id = version
↓
status = published
```

任何步骤失败不得产生数据库与文件系统状态不一致。

必要时先复制到临时目录：

```text
.tmp-xxxx
```

完成后 rename。

---

# 36. 删除策略

默认不提供醒目的永久删除按钮。

优先：

```text
隐藏
归档
```

永久删除必须：

```text
二次确认
输入实验 slug
```

当前 active version 不允许直接单独删除。

删除操作必须写 audit log。

---

# 37. API

至少实现：

## Auth

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

## Experiments

```text
GET    /api/experiments
POST   /api/experiments
GET    /api/experiments/:id
PATCH  /api/experiments/:id
POST   /api/experiments/:id/hide
POST   /api/experiments/:id/archive
POST   /api/experiments/:id/restore
DELETE /api/experiments/:id
```

## Versions

```text
GET  /api/experiments/:id/versions
POST /api/experiments/:id/versions
GET  /api/versions/:id
GET  /api/versions/:id/build-log
POST /api/versions/:id/publish
DELETE /api/versions/:id
```

## Preview

```text
GET /preview/:versionId/*
```

必须经过管理员认证。

未发布 build 不允许直接由 exp-web 访问。

---

# 38. Public API

提供：

```text
GET /api/public/experiments
GET /api/public/experiments/:slug
```

只返回：

```text
published
```

实验。

不得暴露：

```text
source path
build log
admin id
server path
```

---

# 39. 公共实验首页

V1 同时实现简单学生入口。

打开：

```text
https://lab.example.com
```

未登录用户可以看到：

```text
医学微生物学虚拟仿真实验平台
```

以及已发布实验：

```text
封面
名称
分类
简介
进入实验
```

管理员登录入口放右上角。

---

# 40. Compose 文件

必须生成生产可用：

```text
compose.yaml
```

核心结构至少类似：

```yaml
name: microbio-lab

services:

  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - ${DATA_ROOT}/postgres:/var/lib/postgresql/data
    networks:
      - backend
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 10

  app:
    image: ghcr.io/${GHCR_OWNER}/microbio-lab-app:${PLATFORM_VERSION}
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "127.0.0.1:${APP_PORT}:8080"
    volumes:
      - ${DATA_ROOT}/sources:/data/sources
      - ${DATA_ROOT}/builds:/data/builds
      - ${DATA_ROOT}/published:/data/published
      - ${DATA_ROOT}/covers:/data/covers
      - ${DATA_ROOT}/logs:/data/logs
    networks:
      - frontend
      - backend
    depends_on:
      db:
        condition: service_healthy
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL

  builder:
    image: ghcr.io/${GHCR_OWNER}/microbio-lab-builder:${PLATFORM_VERSION}
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - ${DATA_ROOT}/sources:/data/sources:ro
      - ${DATA_ROOT}/builds:/data/builds
      - ${DATA_ROOT}/logs:/data/logs
    networks:
      - backend
    depends_on:
      db:
        condition: service_healthy
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL

  exp-web:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "127.0.0.1:${EXP_PORT}:8080"
    volumes:
      - ${DATA_ROOT}/published:/usr/share/nginx/html/e:ro
      - ./infra/exp-nginx/templates:/etc/nginx/templates:ro
    networks:
      - frontend
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL

networks:

  frontend:

  backend:
    internal: true
```

Codex 必须实际运行：

```bash
docker compose config
```

确认配置有效。

不要机械照抄未验证配置。

---

# 41. `.env.example`

至少：

```text
GHCR_OWNER=your-github-user
PLATFORM_VERSION=v1.0.0

DATA_ROOT=/srv/microbio-lab

APP_PORT=18080
EXP_PORT=18081

POSTGRES_DB=microbio
POSTGRES_USER=microbio
POSTGRES_PASSWORD=CHANGE_ME

DATABASE_URL=postgresql://microbio:CHANGE_ME@db:5432/microbio

SESSION_SECRET=CHANGE_ME_TO_A_LONG_RANDOM_SECRET

PLATFORM_ORIGIN=https://lab.example.com
EXPERIMENT_ORIGIN=https://exp.lab.example.com

NODE_ENV=production
```

README 要指导用户生成：

```bash
openssl rand -hex 32
```

等随机 secret。

---

# 42. Docker Image

发布两个自有镜像：

```text
ghcr.io/<owner>/microbio-lab-app
ghcr.io/<owner>/microbio-lab-builder
```

app 使用 multi-stage Docker build。

运行阶段尽可能：

```text
node:24-bookworm-slim
```

以非 root 用户运行。

Builder 同样使用 Node 24。

Docker image 内不得包含：

```text
GitHub token
生产数据库密码
.env
上传的实验
```

---

# 43. GitHub Actions CI

`.github/workflows/ci.yml`

触发：

```text
push
pull_request
```

执行：

```text
npm ci
lint
typecheck
unit test
integration test
frontend build
API build
Builder build
docker build test
docker compose config
```

任何一步失败：

```text
CI failed
```

---

# 44. GitHub Release / GHCR

`.github/workflows/release.yml`

触发：

```text
tag:
v*
```

例如：

```text
v1.0.0
```

先运行完整测试。

成功后：

```text
docker buildx
↓
build app
↓
build builder
↓
push GHCR
```

生成 tags：

```text
v1.0.0
1.0
1
latest
sha-xxxxxxxx
```

stable release 才更新：

```text
latest
```

建议构建：

```text
linux/amd64
linux/arm64
```

---

# 45. GitHub 权限

Workflow 权限最小化。

Release workflow 至少：

```yaml
permissions:
  contents: read
  packages: write
```

不要在仓库中保存 PAT。

优先使用：

```text
GITHUB_TOKEN
```

完成 Actions → GHCR 发布。

---

# 46. GitHub Release

除 Docker image 外，每次：

```text
v1.0.0
```

生成 GitHub Release。

附带：

```text
compose.yaml
.env.example
README-VPS.md
CHANGELOG
SHA256SUMS
```

---

# 47. VPS 安装命令

README 必须最终做到用户可以基本执行：

```bash
sudo mkdir -p /opt/microbio-lab
sudo mkdir -p /srv/microbio-lab/{postgres,sources,builds,published,covers,logs,backups,trash}

cd /opt/microbio-lab
```

下载 release 中：

```text
compose.yaml
.env.example
infra/
scripts/
```

然后：

```bash
cp .env.example .env
nano .env
```

---

# 48. GHCR 私有镜像情况

如果用户把 GHCR package 设为 private：

README 提供：

```bash
echo "$GHCR_PAT" | docker login ghcr.io \
  -u YOUR_GITHUB_USERNAME \
  --password-stdin
```

PAT 只需要 VPS 拉取镜像所需最低权限。

如果 Package 是 public：

无需登录即可 pull。

---

# 49. 启动

```bash
docker compose pull
docker compose up -d
```

检查：

```bash
docker compose ps
```

健康：

```bash
curl http://127.0.0.1:18080/health/ready
curl http://127.0.0.1:18081/healthz
```

---

# 50. 初始化管理员

```bash
docker compose exec app \
  node dist/cli/create-admin.js \
  --email admin@example.com
```

交互输入密码。

然后浏览器打开：

```text
https://lab.example.com/admin
```

---

# 51. 宿主机 Nginx 示例

必须提供：

```text
docs/nginx-host.example.conf
```

逻辑：

```nginx
server {
    server_name lab.example.com;

    client_max_body_size 5m;

    location / {
        proxy_pass http://127.0.0.1:18080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

实验域：

```nginx
server {
    server_name exp.lab.example.com;

    location / {
        proxy_pass http://127.0.0.1:18081;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

TLS 可以由：

```text
现有 Nginx
Caddy
Cloudflare
Cloudflare Tunnel
```

负责。

不要让 Docker 平台抢占宿主机：

```text
80
443
```

---

# 52. 平台升级

实现：

```bash
./scripts/upgrade.sh v1.1.0
```

流程：

```text
检查当前版本
↓
执行 backup
↓
修改 PLATFORM_VERSION
↓
docker compose pull
↓
docker compose up -d
↓
执行 DB migration
↓
健康检查
↓
输出升级结果
```

升级不得：

```text
删除 /srv
删除实验
删除管理员
删除数据库
```

---

# 53. 数据库迁移

必须实现 migration system。

建议：

```text
db/migrations
```

Docker app 启动前执行迁移。

或者独立：

```text
migrate
```

one-shot service。

无论选择哪个：

必须避免两个 app 同时执行同一个 migration。

V1 只有一个 app，但仍应设计可靠锁。

---

# 54. 平台回滚

实现：

```bash
./scripts/rollback.sh v1.0.0
```

回滚：

```text
Docker image
```

但不自动删除数据。

数据库 migration 要遵循：

**小版本优先做 backward-compatible migration。**

升级前自动备份。

---

# 55. Backup

实现：

```bash
./scripts/backup.sh
```

生成：

```text
/srv/microbio-lab/backups/
2026-08-15_203000/
```

包含：

```text
database.dump
sources.tar.gz
published.tar.gz
covers.tar.gz
metadata.json
SHA256SUMS
```

`builds` 可选择备份。

源码是必须备份项。

---

# 56. Restore

实现：

```bash
./scripts/restore.sh <backup>
```

必须：

```text
提示这是破坏性操作
确认 backup 完整
验证 checksum
停止 app / builder
恢复文件
恢复数据库
重新启动
运行 healthcheck
```

---

# 57. 卸载

普通：

```bash
./scripts/uninstall.sh
```

只执行类似：

```bash
docker compose down
```

绝不能删除：

```text
/srv/microbio-lab
```

如果用户明确：

```bash
./scripts/uninstall.sh --purge-data
```

才允许删除数据，并必须二次确认。

---

# 58. Health Check

App：

```text
GET /health/live
GET /health/ready
```

ready 检查：

```text
server
database
storage readable/writable
```

不要向公网 health endpoint 输出：

```text
密码
路径详情
stack trace
```

---

# 59. Logging

使用结构化日志。

记录：

```text
timestamp
level
requestId
userId
action
experimentId
versionId
```

不要记录：

```text
密码
Session Token
完整 Cookie
数据库密码
```

---

# 60. 上传安全

上传时：

- 最大 10 MiB；
- 仅允许 `.jsx`；
- 检查 MIME 但不只相信 MIME；
- 使用服务器生成 UUID 文件名；
- 不允许 `../`；
- 不允许用户控制服务器路径；
- SHA256；
- UTF-8 验证；
- AST Parse；
- import whitelist；
- 禁止危险 API；
- 保存 audit log。

---

# 61. 首个真实验收文件

把随本规格提供的：

```text
肠道杆菌鉴定虚拟仿真实验.jsx
```

复制到：

```text
samples/enterobacteria/App.jsx
```

作为仓库的 integration fixture。

该测试不能删除。

---

# 62. 必须通过的 Sample Test

启动测试 Compose。

创建管理员。

登录。

创建：

```text
名称：
肠道杆菌的分离培养与生化鉴定

slug：
enterobacteria-identification

分类：
肠道杆菌
```

上传：

```text
samples/enterobacteria/App.jsx
```

预期：

```text
AST PASS
IMPORT PASS
SECURITY PASS
BUILD SUCCESS
```

允许出现：

```text
Google Fonts external dependency warning
```

但不得因此构建失败。

---

# 63. Sample Preview Test

打开管理员预览。

必须出现：

```text
肠道杆菌的分离培养与生化鉴定
虚拟仿真实验
```

React 页面能够交互。

不能只有空白页面。

浏览器 Console 不能有 fatal error。

---

# 64. Sample Publish Test

点击：

```text
发布
```

然后：

```text
GET /api/public/experiments
```

必须出现该实验。

访问：

```text
/experiments/enterobacteria-identification
```

必须加载 iframe。

iframe：

```text
https://exp.../e/enterobacteria-identification/v000001/
```

实验正常运行。

---

# 65. Version Test

再次上传一个修改后的 JSX。

创建：

```text
v000002
```

不得覆盖：

```text
v000001
```

发布 v2：

```text
active → v000002
```

然后选择：

```text
回滚到 v000001
```

必须：

```text
active → v000001
```

v2 文件仍存在。

---

# 66. Archive Test

归档实验。

公共 API：

```text
不再显示
```

管理员：

```text
仍然可以看到
仍然可以恢复
版本仍然存在
```

恢复后可再次发布。

---

# 67. Builder Security Tests

以下 JSX 必须失败：

```jsx
import fs from "fs";
```

```jsx
import { exec } from "child_process";
```

```jsx
fetch("https://example.com");
```

```jsx
const x = eval("...");
```

```jsx
import("unknown-module");
```

这些错误必须显示清楚原因，而不是：

```text
500 Internal Server Error
```

---

# 68. 数据持久性测试

上传并发布样例实验。

执行：

```bash
docker compose down
docker compose up -d
```

确认：

```text
管理员仍存在
实验仍存在
版本仍存在
发布状态仍存在
JSX仍存在
```

然后升级 app image 后重复检查。

---

# 69. 容器隔离验收

确认：

```text
app
builder
exp-web
db
```

没有任何一个挂载：

```text
/var/run/docker.sock
```

Builder 不能看到：

```text
宿主机 /
宿主机 /etc
其他 Docker 容器文件
```

---

# 70. 测试框架

至少包含：

```text
Unit Test
Integration Test
API Test
E2E Test
```

前端 E2E 建议：

```text
Playwright
```

---

# 71. CI 必须真正测试 Docker

CI 不能只：

```text
npm test
```

还必须至少：

```text
docker build app
docker build builder
docker compose config
```

如果 CI 时间允许：

使用临时 Compose 启动：

```text
db
app
builder
exp-web
```

执行 sample integration test。

---

# 72. Error Handling

管理员后台不能只出现：

```text
Something went wrong
```

应该分类：

```text
UPLOAD_INVALID
JSX_PARSE_ERROR
IMPORT_NOT_ALLOWED
SECURITY_BLOCKED
BUILD_FAILED
DATABASE_ERROR
STORAGE_ERROR
PUBLISH_FAILED
```

并提供可理解的中文错误信息。

---

# 73. 管理 UI 中文

V1 主界面使用中文。

状态：

```text
草稿
构建中
构建成功
构建失败
已发布
已隐藏
已归档
```

技术日志可保留英文。

---

# 74. 响应式界面

管理员主要针对桌面，但至少保证：

```text
Mac
Windows
iPad
```

正常显示。

学生实验页 iframe：

```text
desktop-first
```

同时适配平板。

---

# 75. 不属于 V1 的内容

暂时不要实现：

```text
学生账号
班级
课程
教师账号
成绩持久化
AI Tutor
AI Examiner
LTI
Moodle
SCORM
多租户
复杂 RBAC
实验 ZIP 上传
实验图片资产管理器
多人实时协作
```

但架构不得阻碍以后添加这些功能。

---

# 76. 为 V2 预留 Experiment SDK

V1 可以定义但暂不强制使用：

```javascript
window.parent.postMessage(...)
```

事件协议。

例如未来：

```json
{
  "schema": 1,
  "type": "experiment.completed",
  "experimentId": "...",
  "attemptId": "...",
  "score": 92
}
```

V1 不保存学生成绩。

---

# 77. README 必须包含

README 至少包括：

```text
项目介绍
架构
本地开发
环境变量
Docker 构建
Compose
GitHub Actions
GHCR
VPS 安装
Nginx
管理员初始化
JSX 上传
版本管理
升级
回滚
备份
恢复
卸载
安全设计
故障排查
```

---

# 78. SECURITY.md

说明：

```text
JSX属于可执行浏览器代码
为什么使用独立 Origin
为什么禁止 npm install
为什么 Builder 没有 Docker socket
为什么限制网络
为什么 iframe sandbox
为什么使用 CSP
```

---

# 79. RELEASE 标准

第一个可用 release：

```text
v1.0.0
```

只有以下全部完成才允许创建：

```text
CI green
Docker build green
Sample JSX green
E2E green
Compose green
Backup test green
Persistence test green
```

---

# 80. 最终 GitHub 成果

目标仓库必须包含完整代码并 push。

自动生成 GHCR：

```text
ghcr.io/<owner>/microbio-lab-app:v1.0.0
ghcr.io/<owner>/microbio-lab-builder:v1.0.0
```

同时：

```text
latest
```

指向 v1.0.0。

不要猜测 GitHub owner。

从：

```bash
git remote -v
```

解析当前目标仓库。

如果当前目录没有正确的 Git remote：

**不要擅自 push 到其他仓库。**

完成本地工作，并明确提示需要设置 remote。

---

# 81. 最终 VPS 用户体验

VPS 上最终应只需大致：

```bash
sudo mkdir -p /opt/microbio-lab
sudo mkdir -p /srv/microbio-lab

cd /opt/microbio-lab
```

获取 release 配置后：

```bash
cp .env.example .env
nano .env

docker compose pull
docker compose up -d
```

创建管理员：

```bash
docker compose exec app \
  node dist/cli/create-admin.js \
  --email ADMIN_EMAIL
```

最后：

```bash
docker compose ps
```

应全部 healthy。

---

# 82. VPS 更新体验

未来：

```bash
cd /opt/microbio-lab

./scripts/upgrade.sh v1.1.0
```

完成：

```text
备份
pull
migration
restart
health check
```

实验和数据库不丢失。

---

# 83. VPS 日常管理

查看：

```bash
docker compose ps
```

日志：

```bash
docker compose logs -f app
docker compose logs -f builder
```

重启平台：

```bash
docker compose restart app builder
```

完全停止：

```bash
docker compose down
```

再次启动：

```bash
docker compose up -d
```

均不得损坏实验数据。

---

# 84. 构建完成后必须给用户的报告

Codex 最终不要只说：

```text
Done
```

必须输出：

### GitHub

```text
Repository:
Commit:
Tag:
Release:
```

### Docker

```text
App image:
Builder image:
```

### Tests

```text
Unit:
Integration:
E2E:
Sample JSX:
Compose:
```

### VPS

给出最终复制粘贴命令：

```bash
...
```

### 管理员

给出创建管理员命令。

### 域名

给出：

```text
lab.example.com → 127.0.0.1:18080
exp.lab.example.com → 127.0.0.1:18081
```

### 已知限制

列出真实存在的限制，不得隐瞒失败项。

---

# 85. 开发实施顺序

请按以下顺序真正完成工作，而不是同时生成大量未测试代码：

```text
Phase 1
Monorepo + DB + API + React

Phase 2
管理员认证

Phase 3
Experiment CRUD

Phase 4
JSX upload + source storage

Phase 5
Builder + AST validator + esbuild

Phase 6
Preview

Phase 7
Publish + exp-web

Phase 8
Versioning + rollback

Phase 9
Archive/delete/audit

Phase 10
Docker Compose

Phase 11
Sample JSX integration

Phase 12
Backup/update scripts

Phase 13
CI

Phase 14
GHCR release

Phase 15
完整 E2E 和文档
```

每个 Phase 完成后运行对应测试。

---

# 86. 最重要的验收标准

V1 是否成功只看一个最终场景：

```text
在一台全新的 Linux VPS
↓
安装 Docker
↓
部署 compose
↓
创建管理员
↓
浏览器登录
↓
点击“新建实验”
↓
上传 Claude 下载的 JSX
↓
平台检查
↓
构建成功
↓
点击预览
↓
实验正常运行
↓
点击发布
↓
退出管理员
↓
学生首页找到实验
↓
进入实验
↓
实验正常互动
↓
管理员上传新版
↓
发布新版
↓
回滚旧版
↓
一切正常
```

如果这个闭环没有真实跑通：

**V1 不算完成。**

---

# 87. 当前提供的首个测试实验

本项目首个正式集成样例为：

```text
肠道杆菌鉴定虚拟仿真实验.jsx
```

它应该成为：

```text
samples/enterobacteria/App.jsx
```

并永久作为 regression test fixture。

不要为了让测试通过而修改其教学逻辑。

如果需要针对平台兼容性做处理：

应由 Builder wrapper 完成，而不是修改实验内容。

---

# 88. 最终目标

V1 完成后，教师日常工作流应该只有：

```text
Claude 创建虚拟实验
↓
下载 JSX
↓
后台上传
↓
预览
↓
发布
```

平台维护工作流：

```text
GitHub Release
↓
GHCR Docker Images
↓
docker compose pull
↓
docker compose up -d
```

实验内容升级与平台软件升级必须彻底分离。

这是本项目最重要的长期架构原则。
