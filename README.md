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
