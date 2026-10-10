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

## Implementation note — 2026-10-10

The new `src/server/admin-auth/oauth-core.js` is **server-only groundwork**, not a working login system. It creates random transaction state, builds an OAuth authorization URL, checks callback state expiry, exchanges a code server-side, and builds opaque HttpOnly session cookies; unit tests have been added but are **not yet run in a reliable pnpm environment**.

Before OAuth can replace PAT:
1. Confirm GitHub OAuth App PKCE support for this particular flow; do not claim PKCE security based only on a generated verifier. The current authorization URL does not yet send a PKCE challenge.
2. Implement durable short-lived transaction storage and single-use callback consumption; validate session expiry and revocation server-side.
3. Create GitHub OAuth App credentials with a real callback and store client secret only server-side.
4. Build auth routes, fetch GitHub identity server-side, bind exact allowlisted administrator, store GitHub token on the server only.
5. Refactor post/dynamic baseline GitHub readers and all authenticated live-content/gallery write endpoints to use the same session. No PAT fallback once OAuth is accepted.
6. Test login, logout, expiry, replay, CSRF, failed GitHub responses and cross-origin requests.
7. Do not expose partial login as production-ready or modify master.


## 2026-10-10 — Cross-instance write safety implemented (source-stage)

- EdgeOne `/api/live-content` now supplies `createDistributedContentLock(blob)` to the service for post, moment, rename, delete, restore, and Git tombstone undo mutations.
- Mutation locks use Blob `onlyIfNew` and are validated by a runtime capability self-test before accepting writes. If the pinned SDK does not support conditional writes, mutations fail closed.
- Lock collisions return HTTP 409 and never silently overwrite the other writer. Lock expiration is deliberately not auto-recovered: recovery must quiesce writers and clear stale keys explicitly.
- `tests/live-content-service.test.mjs` now includes an inter-instance lock-collision regression case.
- **Still unverified**: `pnpm` tests, Astro compilation, EdgeOne SDK runtime compatibility, and gallery browser interactions. No cloud builds triggered.
