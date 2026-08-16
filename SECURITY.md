# Security

## 威胁模型

JSX 是可执行的浏览器代码，即使由可信教师上传，也可能包含误用、第三方生成缺陷或恶意逻辑。V1 将静态检查视为前置过滤，而不把它当成唯一沙箱。

平台采用多层边界：

1. 只接受单个、限长、UTF-8 JSX，并用 UUID 生成存储路径。
2. Babel AST 拒绝未知 import、Node 模块、动态代码执行和网络 API。
3. Builder 不执行 JSX，只用 esbuild JavaScript API 打包；不执行 shell、`npm install` 或上传的配置文件。
4. Builder 位于无公网路由的 Docker internal 网络，没有端口、Docker socket、额外 capabilities 或 root 权限；源码只读，rootfs 只读，并设置 CPU、内存、PID 和 `/tmp` 限制。
5. 只有校验 manifest SHA256 后的构建可发布。`exp-web` 只读挂载 published，不可见 sources、builds、数据库和 Docker socket。
6. 实验使用与平台不同的 Origin。管理 Session 是平台 host-only Cookie，不对实验子域开放。
7. iframe 仅授予 `allow-scripts allow-forms`，无 same-origin、顶层导航、弹窗权限，并使用 `no-referrer`。
8. 实验 CSP 默认阻止连接、对象、外部脚本和任意资源，仅为 Google Fonts 开放指定样式/字体域。

## 密钥与日志

生产密钥只放 VPS `.env`，镜像、仓库和 Release 不包含令牌或上传资产。管理员密码使用 Argon2id；Session 只在数据库保存带服务器密钥的 HMAC，日志会脱敏 Cookie、Authorization 和 password。审计日志覆盖认证、创建、上传、发布、回滚、下架、归档与删除。

## 漏洞报告

请不要在公开 Issue 中提交可利用细节。通过仓库所有者提供的私密安全报告渠道提交复现、影响版本和缓解建议。收到报告后应先吊销可能泄漏的会话与密钥，再修补和发布安全版本。
