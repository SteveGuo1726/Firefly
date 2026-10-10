# Firefly 画廊 V1 持久预览上线验证（2026-10-10）

## 入口与边界
- **持久实验网站**：https://v1-preview.casto.top/gallery/
- 实验后台：https://v1-preview.casto.top/admin/
- 原来的 workers.dev 域名仍有效：https://firefly-blog-preview.guojunyang666666.workers.dev/gallery/
- 新子域名 `v1-preview.casto.top` 是 Cloudflare Worker Custom Domain，指向已有的 `firefly-blog-preview`，不依赖 15 分钟自动休眠的 Vercel Sandbox。
- 实验用完整原图缓存入口：`https://img-route-preview.casto.top`，只读、只允许已公开照片清单中的地址，不支持任意 URL、未公开路径、POST 或 DELETE。
- 正式 `blog.casto.top`、`img.casto.top`、图床存储和原图上传逻辑**全部未更改**；不备案、不新增服务器或付费服务。

## V1 能力
1. 画廊列表和公开相册页面可以在浏览器选择：智能静态缩略图、Cloudflare 缓存原图（实验）、ImageBed 原图直连；选择存储在浏览器本地。
2. 新上传的原始照片仍完整保存。最长边 480px 的 WebP 由云端发布构建**离线生成衍生副本**，位于 `/gallery-thumbs/` 静态资源，不进行上传时转码。
3. 用户点击照片可以查看完整分辨率的原图。缩略图或缓存图片加载失败时会逐级尝试其他来源。
4. 当前公开源包含 3 个管理相册、22 张图片。已生成 21 张缩略图，其中 1 张公开原图暂时无法从源站完整读取，自动走缓存/原图回退；该文件的实际可恢复性尚待核验。
5. 用户可使用自己的大陆三网网络打开该实验域名进行实际验证，不能把境外探针替代国内三网实测。

## 本轮运行验证

- Vercel Sandbox 实验工作区执行 `pnpm test:live-content`：167/167 测试通过；`pnpm astro check`：0 errors、0 warnings、1 既有 hint。
- `pnpm build:preview` 完整通过，`FIREFLY_BUILD_CHECK_PASS`，内部断链数 0；缩略图已被收入 `dist/gallery-thumbs`。
- 独立图片 Worker 的 4 项请求安全测试和前端线路的 5 项测试均通过。
- 使用真实 Chromium 浏览器打开 Cloudflare 预览站和新自有域名：画廊与相册 HTTP 200、缩略图实际加载成功、3 种线路实际切换成功、刷新后用户选择持续有效，浏览器未出现页面脚本异常。
- 新域名外部抽查：`/`、`/gallery/`、`/gallery/live/?album=castorice-2026`、静态 WebP、`/admin/` 均 HTTP 200。
- Cloudflare `firefly-blog-preview` 本轮最终运行版本 `c14db29b-a128-4527-87e6-13d33691eade`（2026-10-10 15:21 UTC），其画廊 V1 来自实验分支提交 `de4e8c9aa39e8aedb28c1dc3383097cd871a92c4`。

**限制：** 本文的浏览器和云端验证不是国内三网 SLA。Cloudflare Workers 的动态代理仍有限额，不作为未来大流量共享画廊的无限免费出口。静态缩略图可独立扩展，未来须根据中国大陆多运营商实际测速选择加速出口。正式原图仍是 TelegramNew 单源，SHA-256 逐图校验及异地可恢复备份尚待建设。

## 回滚
1. 实验站关闭：在 Cloudflare 仅移除 `v1-preview.casto.top` 的 Custom Domain 绑定。
2. 缩略图失败：浏览器选择“原图直连”；不需要更改原图、图片索引或 DNS。
3. 生产站回滚：无需动作，本轮未修改任何已有生产站配置。

## 下一步
- 保持预览站对外可用，让用户验证 V1 的手机/校园 Wi-Fi 浏览体验。
- 优先补齐 1 张无法生成缩略图的原始文件读取调查，以及 Telegram 单源 SHA-256 和异地备份。
- 后台文章切换性能改进在隔离实验工作区已有代码和测试，须独立审核并构建发布，避免与画廊 V1 混成未经验证的生产更新。
