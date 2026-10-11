# KIRA! JUMP V5 — EdgeOne Pages preview

This is a self-contained static HTML preview of the KIRA ACG discovery interface. Demo artwork and placeholder artist/engagement metrics only. No real authentication, posting or original resolution asset store.

## EdgeOne Pages / Makers Git deployment

- GitHub repository: `SteveGuo1726/Firefly`
- Branch: `kira-edgeone-preview`
- Root directory: `kira-edgeone`
- Framework: Other / static site
- Install command: none
- Build command: none
- Output directory: `.` (root)
- Acceleration region: **Global / excluding mainland China**, as the domain does not have ICP filing
- Custom domain reserved for later production: choose only after Tencent account access and site readiness. Do not change existing `blog.casto.top` or `img.casto.top`.

The `index.html` here is a single-file build, so Git-connected deployment needs no npm or environment secrets. The original full static bundle with separate WebP/JPEG files is in the V5 downloadable archive. For production, separate CSS, JS and images for effective CDN caching: the single-file preview embeds approx 2 MB of demo images and is **not** the final performance architecture.

Cloudflare dev/international preview: https://kira-cf.casto.top/ (worker: `kira-jump-international-preview`).

## Optional GitHub Actions automatic preview deployment

Workflow at `.github/workflows/kira-edgeone-preview.yml` can deploy using `EDGEONE_API_TOKEN` repository secret. Until Tencent EdgeOne account is connected and the token exists, workflow doesn't upload anything. Never commit API tokens to this repository.

## Production guardrails

- Don't move/change any existing `img.casto.top/file/...` paths.
- User uploads, media processing, content moderation, asset metadata, account/community features and real recommendations are not yet implemented.
- Preview performance outside mainland China must not be reported as mainland performance.
- This repository branch is isolated from `master` and does not deploy the Firefly blog.
