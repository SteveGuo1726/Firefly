# Firefly 相册第一版：免费缩略图与可选线路（2026-10-10）

## 已实现的 v1 范围

- 相册列表、公开相册详情均显示 **图片线路** 三档：智能缩略图优先、Cloudflare 缓存原图、ImageBed 原图直连。访客可手动切换，设置只保存在自己的浏览器本地，不收集 IP 或个人信息。
- 智能档先读取静态 WebP 缩略图。某张缩略图不可用时依次尝试 CF 缓存原图与现有原图；只改变前台 `<img>` 请求，不修改上传、原图或 KV 元数据。
- Lightbox 点击查看原图完整分辨率，使用所选的 CF 或直接原图访问路径。
- 独立只读代理 `https://img-route-preview.casto.top` 仅允许当前公开清单中的 22 个原图路径，不接受任意源 URL 或私有图，不支持写入；缓存命中可直接在边缘返回。
- Cloudflare **博客实验构建**通过 `scripts/generate-public-gallery-thumbnails.mjs` 从公开画廊 API 读取列表，用 Sharp 预生成最长边 480px 的 WebP，并纳入博客站点静态资源目录。构建脚本 **不处理上传**、不改动原始照片、不读管理员 API 或图床私有数据。原始网址不变。
- `src/data/gallery-thumbnails.json` 是构建前的文字映射/测试种子。每次实验预览构建都会重新生成映射和静态文件，并只列出本轮实际成功生成的缩略图。源码仓库不追踪生成的二进制图片。
- 首轮 22 张公开照片，开发环境成功生成 20 张缩略图；一张超大图超过像素限制、另一张从公开原图及只读 CF 路线均未成功取回。缺失缩略图由浏览器回退原图，不承诺缺失原图一定能显示。

## 正式站和成本边界

- 当前仅限 `ai/preview-test` 和 Cloudflare 实验站；**不更改** `blog.casto.top`、`img.casto.top`、生产图床 Worker、原图或正式 DNS。
- 公开图片 CF 缓存走 Workers **动态请求**，受到 Free 计划日请求数上限限制，因此只是测试档，未来大量使用时不能把它当作无限免费 CDN。静态 WebP 位于站点静态资源，符合静态分发的大容量方向。
- 不备案、不新购服务器、不新增付费服务。没有使用 TinyFish 付费 Agent。
- 不保证一条免费海外线路能满足全国三网；平台会有故障与配额，后续可实测增加 ESA 或其他免备案免费海外静态线路。
- 不在上传时压缩，原始资源仍位于 ImageBed / TelegramNew，需要单独 SHA-256 校验、异地备份和恢复演练才能保障长期共享画廊安全。

## 上线前验收

1. 打开实验博客 `/gallery/`，验证出现三档线路。
2. 选智能，检查真实请求 `/gallery-thumbs/*.webp` 的 Content-Type 和实际字节数。不存在的缩略图应逐级回退。
3. 打开公开相册，验证网格小图、点击后的原图和 Fancybox 放大操作。
4. 选 CF 档，验证通过 `img-route-preview.casto.top/file/photos/...` 获取原图；再选“原图直连”验证使用 `img.casto.top/file/photos/...`。
5. 网络断开、代理 502/404、新增未索引照片等条件下不死循环、不泄漏私有路径。
6. `pnpm astro check`、`pnpm test:live-content`、`pnpm build:preview`、`scripts/verify-preview-build.ts` 均通过，再进行正式站迁移决策。
