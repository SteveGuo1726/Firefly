# KIRA! 独立画廊 / 共享图床项目边界

校正于 2026-10-11。此文档明确取代旧交接中将 Firefly 博客一起接手的误解。

## 项目关系

| 产品 | 对应仓库 / 服务 | 本阶段修改权限 |
|---|---|---|
| Firefly 博客（**范围外**） | `SteveGuo1726/Firefly` 的 `master`；`firefly-blog`、`firefly-gallery-api` | 不修改博客主题、页面、登录、相册、正式部署；只需确保图床旧图片 URL 可访问 |
| 共享图床（**谨慎维护**） | `SteveGuo1726/CloudFlare-ImgBed`；`cloudflare-imgbed`；`img.casto.top` | 将来支持博客和 KIRA 自有作品的图片存储；当前禁止破坏旧接口和历史地址，后端真实存储未核实不得迁移 |
| KIRA! 独立二次元画廊（**主要开发目标**） | `SteveGuo1726/Firefly` 的独立代码树 `kira-development` | 作品发现、瀑布流、站内阅图器、跃迁、未来投稿 / 审核 / 创作者主页；不得与博客功能耦合 |

**切记**：`kira-development` 不是博客 `master` 的同步分支，直接合并可能删除博客文件。KIRA 可以在这条独立开发分支持续开发，但不能因此把 Firefly 博客纳入范围。

## KIRA 现有服务定位（按现状，不重做）

1. **当前主画廊**：`public/index.html`、`public/assets/app.js`、`public/assets/style.css`、`public/assets/pixiv-feed.json`。构建脚本 `preview/build.mjs`，独立 Worker `kira-jump-international-preview`，开发地址 <https://kira-cf.casto.top/>。当前已经有 Pixiv 快照、站内阅图器、角色 / 色彩 / 氛围跃迁。以此为基础推进。
2. **Pixiv 数据源实验**：`pixiv/` 与 `kira-pixiv-feed-dev`，开发地址 <https://kira-pixiv-dev.casto.top/>。它是验证非官方 Lolicon 元数据和阅图功能的工具，不应变成 KIRA 的第二套割裂正式前台。
3. **KIRA 自有内容 API**：`api/` 与 `kira-gallery-api-dev`，开发 D1（当前只读）。未来对接自有 UGC，不复用 `firefly-gallery-api` 的管理员认证和博客相册清单。
4. **历史静态演示**：`kira-jump-static-dev` 配置与早期 demo 资源并非主站，不应把 demo 图片当成真实 Pixiv 原图。

## 边界与验证

- 免费优先。Lolicon 是第三方 Pixiv 索引，GitHub Actions **手动低频**取得元数据快照；主站只读加载 JSON，不做逐访客请求。
- 作品版权归原作者，元数据存在不意味着取得转载授权；不得把外部原图未经授权永久复制到共享图床。开放公开社区前必须建立审核、作者权利确认、投诉和移除机制。
- 显式 R18 标签二次过滤不等于完整安全审核；不伪造点赞或宣称 43 张图对全部网络稳定可达。
- 不使用 TinyFish 付费 Agent、不开付费服务、不开展 EdgeOne/国内部署、不迁移正式域名、不触碰 Firefly 生产系统。
- 所有 KIRA 代码改动提交到 `kira-development`；报告分清 Worker 部署、HTTP/JSON 响应、前端交互、图片预览和原图真正加载、移动端缩放这几层不同验证结论。

下一阶段优先：主画廊稳定性 → 角色/系列/IP/画师/标签跃迁 → 图片降级和移动端 → 未来自有投稿体系与图床隔离。不要回退到普通相册模板或泛图片搜索。
