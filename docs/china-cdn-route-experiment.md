# Firefly 免费大陆访问线路实验 · 2026-10-10

## 目标和不变约束

- 不进行 ICP 备案，不新增服务器，不启用任何付费服务或按量计费计划。
- 不修改生产博客 blog.casto.top、现有原图 img.casto.top、当前 DNS，上传原图字节永远不压缩。
- 先在独立的 Cloudflare workers.dev 域名比较**同一张图片的总加载时间**，再决定是否引入 ESA 全球不含中国大陆节点和 DNSPod 免费三网智能解析。
- 单次网络抽样不能代替中国电信、移动、联通的多次真实测量。

## 已部署的独立实验入口

- HTTPS：https://firefly-cn-route-probe-preview.guojunyang666666.workers.dev/
- 健康检查：`/health`
- 缓存试验：`/sample.png`，内容与 `https://img.casto.top/file/posts/mmdcasto1.png` 相同
- 源码：`worker/china-route-probe-preview.mjs`
- 测试：`node --test tests/china-route-probe.test.mjs`（5 项通过）

Worker 仅允许 GET，不支持用户指定来源/文件路径，不做图片转换，不使用图床管理员凭证。
浏览器测速页面没有自动上传、跟踪脚本或外部分析 SDK。用户自己选择运营商和城市，
点击开始后两条路线各测量 2 次；通过“复制脱敏结果”才能分享报告。

Cloudflare Worker 免费额度为 100,000 次 Worker 请求/天（**整个免费账号共享**），
因此这个动态代理仅用于受控实验，不宜直接承担日后共享画廊的无限量访问。
长期大量缩略图更适合独立 Workers Static Assets（当前免费版每版本 20,000 个文件），
同时需要分片部署、合理缓存和免费额度监控。正式站不调用此实验地址。

## 云端只读实测（不是国内实测）

2026-10-10 从 Vercel Sandbox 的单个云端测试位置，以 curl 拉取相同图片：

| 路线 | 字节数 | 完整耗时 | TTFB | 备注 |
| --- | ---: | ---: | ---: | --- |
| 原图 `img.casto.top` | 1,780,047 | 3.919792s | 2.578504s | 直接请求 |
| CF Worker `/sample.png` 首次 | 1,780,047 | 3.352484s | 2.039228s | X-Firefly-Edge-Cache: MISS |
| CF Worker `/sample.png` 热缓存 | 1,780,047 | 0.056831s | 0.040369s | X-Firefly-Edge-Cache: HIT，CF-Cache-Status: HIT |

三条响应主体 SHA-256 完全相同：
`9467c05c201cfecebdb8734bbdd4e89148828185a76d9afa3e4bedb243d69735`。

从该云端测试位置，直接访问下级别名 `imgcdn.casto.top/file/posts/mmdcasto1.png`
14 秒超时，不证明国内一定超时，且不能把它误当成当前用户访问 `img.casto.top` 的性能。

## 国内免费三网验收方法

1. 分别在中国移动、中国联通、中国电信的真实家庭或手机网络中访问测速页面。
2. 断开 VPN / 境外代理；如不能断开，请注明网络状况。
3. 选择运营商和城市，执行测试，复制报告 JSON（里面没有 IP、Token、Cookie）。
4. 每个运营商至少采样 3 个城市、多时段，记录总耗时与成功率。
5. 如果 Cloudflare 缓存命中更稳，才考虑生成独立不可变缩略图并与现有原图 URL 分离。
6. ESA 候选必须另建**全球不含中国大陆**的免费实验入口，并提供**同一份字节**才能公平对照。
7. DNSPod 基础电信/联通/移动线路在免费解析版有支持，但它只能将用户分配到已经验证的出口，
   不会自动让海外 CDN 变成境内节点。只有分别证实更快、证书和 CNAME 绑定合规后，才考虑子域委派。
8. 正式 DNS、blog.casto.top、img.casto.top 不参与早期实验。

## 进入长期架构之前的限制

- 已缓存文件成功返回不代表其他 POP、其他国家或大陆三网同样命中。
- “边缘缓存 HIT”与真正位于中国大陆的 CDN 节点不是一回事；无 ICP 备案不使用境内 CDN 。
- 免费套餐可被公平使用规则、线路故障、每天动态 Worker 请求限额限制，不能承诺无限容量和 SLA。
- 缩略图另行生成/存储，不能在上传时重编码，原图独立保存并用 SHA-256 + 异地备份校验。
- 不使用 TinyFish 付费浏览 Agent、没有触碰任何生产图片、域名或生产 Worker。

## 官方规则

- DNSPod 免费三网线路：https://docs.dnspod.cn/dns/dns-record-line/
- Cloudflare Workers 免费请求与静态文件：https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Workers Static Assets：https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- ESA 免费 Entrance：https://www.alibabacloud.com/help/en/edge-security-acceleration/esa/product-overview/how-to-get-esa-for-free
- ESA 免备案仅限全球不含中国大陆：https://www.alibabacloud.com/help/en/edge-security-acceleration/esa/support/site-access-related-issues

## 新增的自有域名实验入口（2026-10-10）

- HTTPS：https://cnprobe.casto.top/
- Cloudflare Custom Domain 仅新增这一条实验 DNS/证书记录，指向 `firefly-cn-route-probe-preview`。
- 当前图床 `img.casto.top` 与博客 `blog.casto.top` 的 DNS、Worker 和原图不变。
- 此 Worker 依旧是按量计数的**免费 Workers 动态请求**，不能当作长期无限量缩略图出口；正式分享相册要研究 Workers Static Assets。
- 自有域名同一境外测点的 PNG 试验：首次 4.419522 秒（MISS）、第二次 0.081322 秒（HIT），大小均为 1,780,047 bytes；SHA-256 与源图一致。
- 这只验证当前测试 POP 的缓存和文件完整性，**不代表大陆三网加速已达标**。
- 面向电信/联通/移动的切换决策，仍需要通过此测速页面收集多个地区和时段的自愿匿名结果。
- 如果实验停用，可在 Cloudflare 中移除仅属于 `cnprobe.casto.top` 的 Custom Domain 绑定，不影响生产域名。

注意：Cloudflare 2026 年推出的 Workers Cache 前置缓存机制，即使命中缓存也按 Workers 请求计费/计入用量，因此不能以“命中缓存无需执行 Worker”推断其请求完全免费。大量图片应优先走 Static Assets 免计量的静态请求。

官方定价：https://developers.cloudflare.com/workers/cache/
