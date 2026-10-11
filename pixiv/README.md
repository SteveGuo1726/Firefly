# KIRA! Pixiv 免费作品流 / 开发版

这是接入**真实 Pixiv 插画**的实验性作品流，不是泛图片搜索，也不是 Pixiv 官方 API。首选免费 Lolicon v2 元数据，图片地址由该 API 返回；原图与缩略图均直接由外部提供，**本站不存储、代理或重新上传图片字节**。

## 免费运行方案

- `https://api.lolicon.app/setu/v2`：免费社区接口，需要限制请求频率；2026-10-11 GitHub Actions 实测首批请求 200、返回实际 Pixiv 作品，之后连续请求遭遇 HTTP 429。
- 因此不允许每位访客直接刷新 Lolicon，而是利用本公开仓库**免费的标准 GitHub Actions runner**，偶尔生成 `pixiv/data/feed.json` 缓存快照。
- `pixiv/build.mjs` 合并页面、无密钥的只读快照和 API 路由，产出一个 `dist/index.mjs` Worker。终端运行 `node pixiv/build.mjs`，然后 `npx wrangler deploy -c pixiv/wrangler.jsonc`。
- 访客只访问 Cloudflare Worker 的静态元数据和 `i.pixiv.re` 图片地址，**不再调用 Lolicon**。无需 R2、D1、Telegram、额外服务器、Pixiv 登录 Cookie 或任何付费图片 API。
- 当前批次含 四个频道 Pixiv 作品；默认发现流去重合并，可浏览约 43 张已过滤的真实插画。数量随免费快照更新。只有首个存储快照被验证过，尚未建立定时刷新。
- Pixiv 源站可能删除图片或禁用代理，显示会失败；这是第三方依赖，不应作为长期唯一图源。
- EdgeOne 和国内站部署保持暂停，CF 仅为开发与国际路线验证。

## 链接

开发预览： https://kira-pixiv-feed-dev.guojunyang666666.workers.dev/

原作品和画师由 JSON 元数据内的 Pixiv URL 提供。独立原图在同一阅图器中切换，不把它当成本站已经获得使用许可的自有图片。

## 免费测试

- `.github/workflows/kira-free-pixiv-probe.yml`：手动/修改工作流时运行一次 Lolicon 公共 API 测试并生成快照（若上游 429 则部分频道可能为空）。
- `.github/workflows/kira-pixiv-preview-check.yml`：检查真实 Cloudflare 页面、JSON 数据条数及前端 JavaScript 语法；生成 `docs/pixiv-worker-check.json`。
- 已验证 `i.pixiv.re` 的样例 thumbnail/regular URL 可返回 `200 image/jpeg`（仅 GitHub 测试节点，不代表大陆网络性能或全部图片可达）。

## 版权与可持续性

社区逆向/聚合 API 的开源代码许可不等于 Pixiv 作品的转载授权。正式上线用户共享画廊前须落实投诉/移除流程，尊重作者，并避免把这些无授权图片永久转存自有图床。这个外部流可以作为个人开发验证、发现候选与定位作者的线索。

## 最新开发事实（2026-10-11）

- Lolicon 返回 `r18=0` 的最初 48 条里，5 条仍带 R-18 标签。现有快照已移除，保留 43 条，39 条有通过缩略图提取的主色调。不要把 API 参数等同完整内容安全保证。
- 自动更新只允许在 GitHub Actions `workflow_dispatch` 手动触发，并将新结果与上次成功记录合并，避免 429 或 DNS 故障使图库内容丢失。
- 43 条可用于 KIRA V6 主界面的免费开发，不能保证 Pixiv 创作者授权转载，也不能保证代理长期在线。
