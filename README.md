# KIRA! JUMP — development branch

This is a **standalone KIRA source tree** developed independently from the Firefly blog. This branch intentionally contains only KIRA files. Do not merge it into `master`: that would remove the blog files on the merged tree. The Firefly `master` branch is untouched.

## Frontend

`public/` holds the responsive gallery/reader and 36 separately cached image assets, split from V5's ~1.9 MB inline HTML. 12 illustrated **demo** works have WebP card, WebP preview and JPG demo-original variants. Demo originals are small crops and **are not true full-resolution originals**. Browser-only favorites persist in localStorage, opening a work updates its shareable `#art-id` URL, recommendations prefetch two previews. Main artwork viewer still zooms the image alone.

`npx wrangler deploy -c wrangler.jsonc` uses Cloudflare Workers Static Assets under independent service `kira-jump-static-dev`; no SSR or image-transform Worker requests are required. The already-live `kira-cf.casto.top` V5 monolith has **not** been replaced yet.

## Backend

`api/src/index.js` is deployed as isolated read-only Worker `kira-gallery-api-dev`, with D1 `kira-gallery-development`. Migration: `api/migrations/0001_init.sql`.

- `GET /health`
- `GET /api/v1/works?order=latest|popular&limit=12&cursor=...` — stable cursor feed, published general works only
- `GET /api/v1/works/:id` — metadata, multiple assets and facet tags
- `GET /api/v1/jump?seed=<work-id>&axis=character|color|mood&limit=9` — D1-indexed related works

There are deliberately no write endpoints yet. D1 begins empty so demo creators/likes are not treated as real content. Future migration adds review and attribution before publication. No R2 binding or paid services required for this milestone.

## Guardrails

Keep current blog and `img.casto.top` file URLs unchanged. Avoid any EdgeOne/domestic site deployment during this development phase. Real media variants, uploader authentication, moderation, ownership and licensing have not been implemented yet. The demo images are generated imagery for UI validation.

## 真正的 Pixiv 免费图源（开发）

独立体验：https://kira-pixiv-feed-dev.guojunyang666666.workers.dev/

代码：`pixiv/`。Lolicon API v2（免费，未登录），GitHub Actions 标准 runner 低频产生插画元数据快照，CF 只读加载快照，原图经第三方 URL 直接显示。当前已采样 43 张经过标签过滤的真实作品（全年龄，排除标记 AI），无需 D1、R2 或付费服务。更多见 `pixiv/README.md`。

先前 Openverse / Danbooru Source Lab 已从 Worker 和开发代码中删除；不使用付费 TinyFish Agent。

### V6 真实 Pixiv 主界面（CF 开发路线）

- 在线入口：https://kira-cf.casto.top/
- 43 条经全年龄及显式 R-18 标签二次过滤的 Pixiv 索引；39 条已测量缩略图主色调。原图与缩略图仍由外部代理 URL 承载，未复制到图片床。
- 浏览器里运行瀑布流、作品详情、图片专属缩放、角色／色彩／氛围跃迁、本地关注和本地收藏。没有伪造热门点赞数。
- 构建：`node preview/build.mjs`；配置：`preview/wrangler.jsonc`，继续使用独立 Worker `kira-jump-international-preview`。
- 色彩特征：`scripts/enrich-pixiv-palette.py`（通过免费公开仓库 GitHub Actions 分析缩略图，仅存储 HSV 主色调和 HEX 色值）。
- 安全：图片索引拒绝带显式 R-18 标签的条目，即使上游标称 `r18=0`；刷新需要手动触发且会保留旧的成功数据，防止免费 API 429 清空图库。
- 当前是开发预览。EdgeOne、中国大陆路由以及博客生产服务均未修改。
