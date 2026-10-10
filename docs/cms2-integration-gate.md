# CMS 2.0 integration gate (no automatic cloud builds)

## Non-negotiable gate
Do not invoke Cloudflare build-only, EdgeOne builds, or production deployment on individual commits. Continue editing ai/preview-test. Validate syntax, unit behavior, type-check, runtime bundles, integration, and browser screenshots in an executable local/temporary development environment FIRST. Only invoke one build-only at a complete release candidate.

## Current environment facts
- The chat container has Node 22.16.0 but no pnpm; outbound GitHub DNS resolution failed. This does not qualify as the requested local build verifier.
- GitHub Actions build.yml and biome.yml respond only to master pushes and PRs targeting master, not plain pushes to ai/preview-test.
- GitHub Actions preview-check.yml is workflow_dispatch, not automatic.
- Cloudflare's separate build-only trigger is manual and must not be called before this gate is satisfied.
- These observations do not prove no external auto-deploy hooks exist; check Cloudflare/EdgeOne project branch connections before any large push or PR.

## Work ledger
### Authentication and access (P0)
- [ ] GitHub OAuth app configured by owner with exact callback URL; no fake client secret.
- [ ] Provider callback exchanges code SERVER-SIDE only.
- [ ] PKCE, state, redirect whitelist, single-use state and request timeout tested.
- [ ] Server-side opaque session (HttpOnly Secure SameSite), storage-backed revocation and expiry.
- [ ] Separate read/write API access checks; no bearer PAT forwarded to browser.
- [ ] Gallery API and live-content API authenticate same server session without PAT.
- [ ] Delete migration paths that restore old PATs; revoke obsolete secrets once rollout works.

### Editors and no-build content (P0)
- [ ] Independent post/dynamic editors complete metadata, Markdown/MDX previews, image upload, draft recovery, original frontmatter preservation.
- [ ] Full CRUD/rename/delete/restore on live Blob API without triggering builds.
- [ ] Public home/archive/tag/category/search/detail/dynamic source revision coherence; verify static and new URLs.
- [ ] Concurrent multi-region writes and Git archival rollback.
- [ ] Cross-tab session and real-data synchronization checks.

### Gallery (P0)
- [x] Import Fancybox v6 stylesheet in album runtime.
- [x] Prevent global and album Fancybox double-binding; one delegated listener.
- [x] Replace obsolete Fancybox button CSS with v6-scoped styles.
- [ ] Browser screenshot/interaction checks at 360, 390, 768 and 1440 pixels; portraits, panoramas, small images and zoom.
- [ ] Keep original dimensions and native ratios, confirm toolbar does not overflow, keyboard and touch.
- [ ] Test gallery media uploads, reorder, deletion, immediately visible gallery state.

### Build gate
- [ ] A network-capable free development machine confirmed usable from ChatGPT for install/test/check/build/dev (avoid claims based on marketing alone).
- [ ] pnpm install --frozen-lockfile
- [ ] pnpm test:live-content
- [ ] pnpm verify:runtimes
- [ ] pnpm astro check
- [ ] pnpm build:preview
- [ ] Real browser preview and screenshots.
- [ ] Tests red/green and output archived; no secret leakage in logs.
- [ ] Only then ONE Cloudflare build-only for candidate HEAD (deploy command must remain no-op).
- [ ] Explicit owner authorization before any master changes, DNS changes, or production rollout.

## Cost priorities
Keep hosting entirely on free plans with enough headroom. Mainland speed is a secondary optimization after reliability and truly free service. Do not enable R2, Access, paid China Network, or other billing-dependent products without owner approval. Preserve Cloudflare DNS and Netlify Twikoo until tested migration and rollback exist.
