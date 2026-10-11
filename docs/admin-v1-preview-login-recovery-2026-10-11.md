# Firefly 实验后台登录恢复 — 2026-10-11

## 当前可用入口

- 实验后台（持久 Cloudflare HTTPS）：https://v1-preview.casto.top/api/admin/auth/editor/
- 现有静态路径 https://v1-preview.casto.top/admin/ 仍引用旧版打包资源，在完全重新部署前不应作为验证入口。
- 此临时入口只针对 Cloudflare 实验博客 Worker firefly-blog-preview。生产 blog.casto.top、img.casto.top、正式 Worker 和原图存储未变更。

## 根因与修复

旧 src/components/pages/admin/AdminApp.svelte 将编辑登录入口同时限制在 workers.dev 主机名和 PUBLIC_FIREFLY_PREVIEW_DEMO 构建标志下，持久预览域名因此无法触发预览登录。ai/preview-test 分支已修复域名白名单及构建标志错误依赖，并集成文章/动态异步预览与 GitHub 内容缓存。

由于 Vercel Sandbox 中 Wrangler 未获 Cloudflare 认证，完整静态资产重发尚未进行。在 Cloudflare 实验 Worker 使用 /api/admin/auth/*（已有 run_worker_first）公开一个临时页面路由：从现有 /admin/ 静态页面改写组件地址，为 Svelte 打包模块进行限定的主机识别和模块导入路径修复。Worker 代码通过 Cloudflare Scripts /content 接口更新，该接口保留现有密钥和 KV/ASSETS 绑定；不触碰正式 Worker。

**浏览器验证**：Cloudflare 页面及模块 HTTP 200。Headless Chromium 真实访问可见“实验内容后台登录”、密码输入框、登录按钮，页面错误数 0。使用仅限浏览器的模拟已认证 /api/admin/auth/me 响应，文章及动态编辑面板正常渲染且 JS 错误数 0；此测试**不代表生产密码登录或实际服务器保存通过**。

## 权限和认证

- 真正的登录由 Worker 的 /api/preview-admin/login 校验 `FIREFLY_PREVIEW_ADMIN_PASSWORD`，认证成功后发放 HttpOnly、Secure、SameSite=Strict 的有期限 Cookie。
- 不能从 GitHub、前端打包文件或 Cloudflare API 中读取已有管理员密码；不可为了演示允许匿名写入。
- 未认证 /api/admin/auth/me 返回 authenticated=false；错误密码返回 HTTP 401。
- 管理后台写操作仍须服务端会话鉴权。保存与恢复操作的线上端到端测试尚未取得有效管理员会话，因此不得声称通过。

## 当前待发布

- 实验分支最新代码中的 AdminApp 登录修复、AdminPostManager/AdminDynamicManager 异步预览及辅助控制器测试已通过 GitHub connector 提交。
- 等具备完整 Cloudflare Worker 静态资产发布能力后，运行 `pnpm verify:preview` 构建并部署最新 ai/preview-test。完成后直接测试 /admin/ 登录和文章/动态 CRUD，并移除 Worker 临时兼容入口。
- 如果有回归，实验 Worker 在 2026-10-10 15:21 UTC 的已知版本为 `c14db29b-a128-4527-87e6-13d33691eade`，可只回退实验 Worker 部署，不需要更改生产。

