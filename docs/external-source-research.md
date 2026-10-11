# KIRA External Source Evaluation — 2026-10-11

## Decision

KIRA's **owned/approved artwork feed** and **external discovery feed** must remain separate. Being publicly accessible through an API **does not** grant artwork copyright, permission to reproduce or redistribute originals, or a license for paid publication.

### Sources investigated

| Provider | Public interface | Practical finding | Integration decision |
|---|---|---|---|
| Pixiv | Old public API deprecated; third-party PixivPy requires app OAuth refresh token | Unofficial methods can break and do not grant artist reproduction rights. i.pximg.net image hotlinking typically requires referer | **No scraping**, no auth bypass, no copying or proxying full images. Link to the actual Pixiv artwork only when metadata includes a valid Pixiv ID |
| Danbooru/Safebooru.donmai.us | `GET /posts.json?tags=rating:g&limit=16` with official documented limits | Public metadata includes ratings, character, IP and artist tags and original source IDs. Worker-origin probe returned unavailable (503) on this deployment. Images are third-party copyright | Experimental **metadata links only**, no image proxy, explicit general rating filter, cache and very low shared request budget |
| Openverse | `GET https://api.openverse.org/v1/images/?q=anime&page_size=16`, free anonymous requests | Works; API supplies authors, source landing URL, declared CC/public-domain licenses. Results quality mixed, including AI-generated works and poorly credited images | **Live external preview/source lab**; no automatic import into KIRA; explicit source and declared license; exclude tagged AI by default (user may opt in) |
| Safebooru.org | Gelbooru-compatible API | Terms prohibit automated retrieval and indexing by anyone other than public search engines | **Do not integrate** |
| Gelbooru | DAPI endpoint with auth/throttling; no blanket image license | Authentication/rate limiting and copyright uncertainty make it unsuitable as a default unlimited free feed | No deployment |
| Waifu.im | Basic SFW GET images without token | Site currently announces shutdown on Oct 17 2026; source licenses not assured | **Do not depend on** |
| Nekos.best | Free API | Its Feb 17 2026 ToS prohibits commercial use, content rehosting, mass fetching and public redistribution of cached API responses | **Do not integrate** |

Authoritative docs:
- https://www.pixiv.help/hc/en-us/articles/235584448-Can-I-post-works-that-are-posted-on-other-websites
- https://github.com/upbit/pixivpy
- https://safebooru.donmai.us/wiki_pages/help:api
- https://safebooru.donmai.us/wiki_pages/api:posts
- https://api.openverse.org/v1/
- https://safebooru.org/tos.php
- https://docs.nekos.best/legal/tos.html
- https://www.waifu.im/

## Deployed discovery architecture

```
KIRA permanent feed:
  Cloudflare D1 creators/works/assets/facets
  only reviewed, published, general-rated artwork
  future: opt-in user uploads, proof of license, content review

External experiment:
  /explore.html -> /api/v1/external/openverse?channel=...&page=...
                -> /api/v1/external/danbooru?channel=...&page=...
  no writes into KIRA work tables
  no full-image downloads, proxying, or third-party image persistence
  source URL, artist, tags, rights_status, explicit can_import:false
```

The API enforces a per-source, per-UTC-day shared D1 budget across locations, **60 Openverse misses/day and 8 Danbooru misses/day**. Before a remote fetch, the Worker consults the edge cache (6 hours) then atomically increments the D1 budget. Budgets are conservative because Openverse anonymous API's rate limit is 200/day and cache entries are only per data center. A hit doesn't consume the remote-source budget, but still consumes Workers request quota.

Source-lab preview: https://kira-source-lab-dev.guojunyang666666.workers.dev/ 
Read-only development backend: https://kira-gallery-api-dev.guojunyang666666.workers.dev/health

## Before a public release

1. Obtain permissions directly from creators for in-site thumbnails/previews where a license is not independently verifiable.
2. Require an original source, attribution, work title, explicit moderation status and per-asset variant metadata before an image can be published as a first-party item.
3. Respect source rate limits, removals, and opt-outs; add cache invalidation and an abuse-report workflow.
4. Benchmark real network performance and media caching independently; the free API is not a CDN to serve large original images.
5. Treat any Pixiv URL found in Booru tags/metadata as a **link to creator/source**, never a license to copy the file.

### Additional candidates (evaluated, not deployed)

- **Wallhaven**: documented public SFW `GET https://wallhaven.cc/api/v1/search?categories=010&purity=100&q=anime`, no key required for basic search; tags, colors, resolutions, preview thumbnails and source URLs are useful for studying recommendations. As a community wallpaper index it does not grant rights to reproduce or cache the original artists' files; its About page states images remain the property of their owners. Treat as an optional **offsite metadata link** until embedding permission is checked. Official docs: https://www.whvn.cc/help/api and rights: https://www.whvn.cc/about
- **DeviantArt**: an official developer API and oEmbed display mechanism exists; requires registering an app and agreeing to its API License. Better long-term option for opt-in artist content than unofficial Pixiv crawling, but registration, scopes, and rights checks are needed. Docs: https://deviantart.readme.io/docs/getting-started

The existence of image CDN links in these APIs is not permission to hotlink high-resolution assets on a separate public service.
