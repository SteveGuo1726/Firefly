# Firefly CMS 2.0 — OAuth and Gallery Integration Rollout

**Status: code staged on ai/preview-test only. No production deployment or credential change authorized.**

## Architecture

```
Browser blog.casto.top
  GET /api/admin/auth/start        -> GitHub OAuth + PKCE S256
  GET /api/admin/auth/callback     -> one-time state + bound HttpOnly cookie
  GET /api/admin/auth/me           -> public-safe identity-only response
  POST /api/admin/auth/logout      -> same-origin CSRF check, server session revoke

  /admin/ post & moment editors    -> /api/live-content/* (same-origin cookie)
  /admin/ gallery manager          -> /api/admin/{gallery,imagebed}/*
                                        |
                                        +-- EdgeOne checks session and exact route
                                        +-- adds X-Firefly-Service-Key (server only)
                                        v
                                  Cloudflare gallery Worker
                                        |
                                        +-- validates shared secret
                                        +-- forwards existing image-bed operations
```

GitHub access tokens and OAuth app secret never enter localStorage/sessionStorage/browser responses. The browser receives only an opaque HttpOnly Secure SameSite=Lax session cookie. Existing public photo and blog APIs must remain usable without credentials.

## Required owner-controlled configuration (not yet set)

GitHub OAuth App must have exact callback **https://blog.casto.top/api/admin/auth/callback**. Verify hostname and canonical site before configuring it.

EdgeOne Pages server environment secrets:
- `FIREFLY_OAUTH_CLIENT_ID` (GitHub OAuth App ID)
- `FIREFLY_OAUTH_CLIENT_SECRET` (GitHub OAuth App secret)
- `FIREFLY_OAUTH_CALLBACK_URL` (exact HTTPS callback)
- `FIREFLY_ADMIN_LOGIN` (explicit expected GitHub login, defaults to SteveGuo1726)
- `FIREFLY_GITHUB_CONTENT_READ_TOKEN` (server-side GitHub Contents: read-only credential; required for OAuth private article index, never exposed to browsers)
- `FIREFLY_GALLERY_SERVICE_SECRET` (fresh random >=32-character high-entropy secret)
- `FIREFLY_GALLERY_API_ORIGIN` (defaults to https://gallery-api.casto.top)

Cloudflare gallery Worker secret:
- `FIREFLY_ADMIN_SERVICE_SECRET` = exactly the same value as EdgeOne `FIREFLY_GALLERY_SERVICE_SECRET`.

Do not store any of these in GitHub source, GitHub Actions logs, public Astro variables, or browser JavaScript. Do not switch production DNS during preview testing.

## Failure behavior

- Missing OAuth app credentials: auth endpoints return HTTP 503; fallback PAT remains available until OAuth is actually configured.
- Once server OAuth reports available, browser stops restoring a legacy PAT session.
- Unknown/wrong GitHub identity: callback fails without issuing a session.
- Missing browser-bound state, reused state or bad PKCE: fails.
- Expired/invalid server session: content mutations and gallery management return unauthorized.
- Missing gallery service bridge secret: OAuth gallery proxy returns 503 instead of leaking a privileged request.
- Unknown gallery management paths: 404; cross-origin writes: 403; redirects from privileged upstream: 502.
- EdgeOne Blob package may be too old to honor `onlyIfNew`. The service performs a runtime conditional-write self-test and rejects OAuth on failure. Confirm the pinned `@edgeone/pages-blob` version and upgrade with matching lockfile if required before release.

## Final approval gate

1. Validate complete `ai/preview-test` source in a reusable local or free environment without spending EdgeOne/Cloudflare build minutes.
2. Run `pnpm install --frozen-lockfile`, `pnpm test:live-content`, `pnpm verify:runtimes`, `pnpm astro check`, `pnpm build:preview`.
3. Browser-test OAuth login/callback/logout/replay prevention; post CRUD; moment CRUD; image insertion; deleted Git and Blob restore; imagebed upload/sort; Fancybox desktop/mobile.
4. Use real preview-domain test secrets, never production secrets, and no production blog DNS change.
5. Only after everything is green, run **one** Cloudflare build-only (not deploy), then request authorization before release to master/production.
6. Rollback by withdrawing OAuth environment keys and shared gallery secret; earlier PAT behavior then becomes available again, but do not use PAT long-term.
7. No billing-dependent services (Cloudflare Access, R2, paid Vercel, or additional deployment minutes) are enabled without approval.

## Remaining engineering risks

- EdgeOne Blog Blob pointers still rely on per-instance mutation locks; there is no proved compare-and-swap for existing keys. Multi-region simultaneous writes remain a blocking production safety issue.
- OAuth API and gallery proxy are not yet tested in a real EdgeOne runtime. The current code is only source-stage, not a deployable production claim.
- GitHub repo must be publicly readable for current browser-only source fallback under OAuth; private repository support needs a server-side Git reader.
- Admin photo visual acceptance requires real browser screenshots, including large portrait/panorama assets.


## Private content index and experimental preview

The public prerendered `/api/admin-content-index.json` excludes draft and password-protected post metadata. The authenticated EdgeOne `/api/admin/private-index` verifies the OAuth session and reads the complete GitHub baseline using a server-only read credential. PAT mode reads the tree with the browser-held session token and fetches only entries missing from the public index. Both modes fail closed if the tree is truncated. Cloudflare Workers preview is a **separate runtime** and does not provide the EdgeOne OAuth routes; test the preview CMS in PAT mode, then verify OAuth on a properly configured EdgeOne preview before production.

The experimental Cloudflare Workers Builds trigger targets `firefly-blog-preview` and branch `ai/preview-test`, with `pnpm verify:preview` before `pnpm exec wrangler deploy -c wrangler.preview.jsonc`. Its path include rule intentionally prevents push-triggered builds. Production `firefly-blog` is not changed.
