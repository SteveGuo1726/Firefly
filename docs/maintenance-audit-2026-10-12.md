# Firefly 仓库与站点巡检 · 2026-10-12

> 范围：`SteveGuo1726/Firefly`、正式 EdgeOne 页面、关联的 Cloudflare Workers 与公开相册。本文记录已做的整理，以及需要独立跟进的风险，不是“所有服务均已通过管理员端到端验收”的声明。

## 本次改进

- 将相册图片线路选择重做为适配手机的 3 档卡片，保留原有 `auto/cloudflare/original` 设置和失败回退规则；按钮支持 `aria-pressed`、键盘焦点和减少动画偏好。
- 主导航栏右上角为内容管理员留出清晰的图标入口 `/admin/`。授权校验仍由后端 API 执行，图标并不开放任何管理权限。
- 将传统模板 README 改为星遐蝶梦本站介绍，使用已存在的主题素材与真实公开相册封面，标注图片来源。
- 移除约百份误提交到 Git 的本地配置历史、开发日志、一次性测试脚本及过时的开发工作流；在 `.gitignore` 中防止本地文件再次入库。Git 历史仍保留过去的提交；**此次没有重写 Git 历史**。
- 清理 Cloudflare 上两个已确认不被正式功能调用的探针 Worker：`firefly-cn-route-probe-preview` 和 `firefly-cnb-adapter-preview`。一并解除 `cnprobe.casto.top` 的试验性 Worker 域名绑定。
- 删除过时的 CDN 线路测试报告及测试工作流，保留可用的正式构建、站点检查、友链数据刷新、实时内容归档与预览检查。

## 保留且必须保护的线上服务

| 服务 | 处理 | 原因 |
| --- | --- | --- |
| `blog.casto.top`（EdgeOne Pages） | 保留 | 正式博客、后台与实时内容 |
| `cloudflare-imgbed` / `img.casto.top` | 保留 | 公开相册的原图资源 |
| `firefly-gallery-api` / `gallery-api.casto.top` | 保留 | 公开相册与图库元数据 |
| `firefly-gallery-route-preview` / `img-route-preview.casto.top` | 保留 | 仍被正式相册缓存线路选择器引用 |
| `firefly-blog-preview` / `v1-preview.casto.top` | 保留 | 独立预览环境 |
| `firefly-blog` Cloudflare Worker | 保留 | 仍配置了 `blog.casto.top/*` Route，删除前需要单独评估 Cloudflare 路由与 EdgeOne DNS |
| `firefly-gallery-api-preview` | 保留 | 独立图集预览 |
| `folia-*` / `kira-*` | 未处理 | 属于其他项目，不能当作 Firefly 冗余资源删除 |

## 发布与测试

- `pnpm astro check`：检查源文件类型与 Astro 组件问题。
- `pnpm test:live-content`：包含 CMS、图库、权限、内容历史、导航和 README 回归测试。
- `pnpm verify:runtimes`：检查 EdgeOne / Cloudflare Worker 服务端打包。
- `pnpm build`：验证正式静态生成和内部资源引用。
- 公开端点巡检包括博客、后台、相册、Gallery API、原图与 Cloudflare 图片缓存线路。

## 后续需要独立处理的问题

1. **相册管理代理仍依赖服务端密钥**：`FIREFLY_GALLERY_SERVICE_SECRET` 需与上游 Gallery API 一致；没有该配置时，管理代理按设计 503 关闭，公开相册正常。不得将密钥提交到仓库。
2. **线上相册包含 `test` 公开图集**：因其关联真实图床文件，未自动删除，避免误删用户内容；可在确认备份后由管理员自行删除。
3. **依赖安全审计提示多个高风险间接依赖**：`pnpm audit --prod --audit-level high` 报告涉及旧版构建或运行依赖（如 `serialize-javascript`、`fast-uri`、`sharp`、`undici` 等）。未通过强制覆盖跨主版本传递依赖来冒险“修复”，应按根依赖、实际可利用路径与兼容性逐项升级并完整验证，独立提交。
4. **管理员端到端写入未由巡检账户执行**：未使用或存储站长的真实凭据；正式后台功能变更应由管理员登录后做一条可删除的测试动态验证。
5. **个别旧文档和国际化 README 属于 Firefly 主题历史资料**：本轮保留其参考价值，当前站点请以主 README、实际配置和正式域名为准。
