# Firefly free-first infrastructure migration gates

Status: **research / read-only audit**. This document authorizes no production change.

## Observed configuration (2026-10-10)
- Public site `blog.casto.top`: DNS-only CNAME to `eoblog.casto.top`, then to EdgeOne.
- Image hostname `img.casto.top`: DNS-only CNAME to `imgcdn.casto.top`, which uses a third-party preferred route. Do not treat this dependency as a guaranteed free CDN.
- Gallery API: `gallery-api.casto.top`, proxied by Cloudflare.
- Twikoo: `twikoo-netlify-casto.netlify.app/.netlify/functions/twikoo`, active Netlify project.
- Cloudflare R2 account query currently responds **10042 (enable R2 through Dashboard)**: R2 is not currently provisioned. Free allowance is not proof of zero billing risk.
- EdgeOne Blob should continue holding small live-content documents; its free storage is 1 GB and the documentation advises against public image-hosting/CDN use.

## Hard constraints
1. No paid plan, billing-required service enablement, unapproved DNS changes, or production deployment.
2. Mainland availability is desirable, but stable worldwide reachability and quota safety are prerequisites.
3. Preserve original filenames, URLs, EXIF policy, gallery manifest, and deletion semantics.
4. A migration is not complete until content and links are verified from multiple networks and rollback is tested.
5. Do not burn EdgeOne build quota to test data-only updates.

## Read-only endpoint audit
Run `pnpm audit:endpoints` in a runner with network connectivity. This tests selected public endpoints and prints DNS, HTTP status, latency, and redirect host; it changes nothing and collects no secrets. The runner's network **is not a mainland-China speed test**.

## Storage migration prerequisites
1. Inventory all images and gallery objects: total bytes, count, largest file, public and protected URLs, actual origin provider and authorization model.
2. Check whether R2 can be activated without a payment method or paid obligation. If not, postpone R2 and compare truly zero-cost alternatives; don't assume an advertised free tier qualifies.
3. Estimate average photo views and monthly read/write operations against free caps with headroom.
4. Export a complete backup and manifest with checksums, and do not delete old origin.
5. Create an independent staging hostname and verify images (sizes, content types, CORS, cache, uploads, deletes), old URL compatibility and fallback.
6. Verify TLS/DNS resolution and p95 fetches from several networks, including mainland-China samples when possible.
7. Switch traffic gradually with rollback and monitor errors. Preserve legacy paths at least through the transition.

## Comments migration prerequisites
1. Back up Twikoo database before migrating the runtime; determine which database service holds the real comments.
2. Preserve exact comment URL/page identifiers for articles and dynamics.
3. Validate spam filtering, notifications, identity, admin rights, attachments, and old comment reads.
4. Do not turn off the Netlify project until the replacement has an independently verified rollback.

## Current recommendation
Leave EdgeOne hosting, Cloudflare DNS, image hostname, and Netlify Twikoo unchanged for now. Remove fragile third-party preferred image routing only after a tested replacement has equivalent or better reachability and fits **actual** long-term free quotas.
