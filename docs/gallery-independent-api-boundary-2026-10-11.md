# Firefly Blog ⇄ Independent Image Gallery: preview-only contract

Updated: 2026-10-11. Scope: `ai/preview-test` and the isolated `v1-preview.casto.top` Worker. The independent image-host gallery implementation is owned by a separate project; **this document is an integration boundary, not a migration plan for the image host**.

## Current established reads

- Imagebed public: `GET https://gallery-api.casto.top/api/gallery/public`. Returns `{albums: [...]}`. Verified in the experiment with 3 public albums and 22 photo entries; counts are observations, not fixed assumptions.
- Imagebed public summary: the same endpoint with `?summary=true`; its `photos` arrays may be empty. **Do not** treat the summary as a complete photo manifest.
- Firefly preview authenticated projection: `GET https://v1-preview.casto.top/api/admin/gallery/state`. Requires the preview CMS session cookie; returns `GalleryAdminState` with `readOnly: true`, `source: 'public-gallery-bridge'`. Only existing **public** albums/photos are represented.
- The preview adapter uses direct server-to-server `GET` to the public imagebed endpoint. It does not use the imagebed's management token, GitHub PAT or mutable KV; it limits response size and validates album IDs, directories, photo keys and HTTPS URLs. A failed upstream call must be a visible 502, never silently an empty authoritative manifest.
- `GET /api/admin/gallery/state` requires authentication. Other `/api/admin/gallery/*` and `/api/admin/imagebed/*` routes reject operations from the isolated Worker. Do not proxy management requests into the imagebed.

## Ownership and editing

- **Imagebed** owns uploads, deletes, renames, directory structure, backing photo files and the authoritative full manifest.
- **Blog experiment** owns editor display, safe local draft previews, sorting and metadata editing in the browser, inspection and JSON draft export. `localStorage['firefly.gallery.preview.local-draft.v1']` is only a local device draft and is not shared across browsers.
- Public gallery data might omit unlisted/private albums and images. The experimental backup declares `scope:'public-only-local-draft'` and `safeToReplaceFullManifest:false`. It must never be imported as an entire authoritative manifest.
- Never write `img.casto.top`, `gallery-api.casto.top` or `blog.casto.top` production data from the preview editor.
- No direct storage migration or new gallery endpoints are implemented by Firefly.

## Compatibility requirements for the independently built gallery

When the independent gallery publishes its next API, coordinate these contracts before enabling live editing:

1. Stable album `id`, `sourceDir` and full photo `key` values. Do not silently rewrite keys or relative paths while migrating.
2. Public list response with `albums[].{id,sourceDir,name,description,category,date,location,tags,cover,photoOrder,photos,photoCount,coverUrl}` and `photos[].{key,url,name,size,width?,height?}`. If the schema differs, add a versioned adapter rather than guessing.
3. Separate full management state and public projection. Published counts are not equivalent to a full private manifest. Support pagination or cursor if responses exceed 2 MiB.
4. Management writes should use the new gallery's own authenticated backend and explicit owner approval, with `If-Match` / revision conflict detection, dry-run validation, and backup/rollback. Never send server secrets to the browser or treat blog preview cookies as image-host credentials.
5. Image URLs must remain HTTPS and accessible from the preview domain; document CORS/cache behavior separately from management authentication. Thumbnails should fall back to the original image without rewriting the source key.
6. Distinguish saving a draft, publishing metadata, and changing physical files. Upload/delete/rename must be independently confirmed and audited.
7. Test mobile, tablet and desktop views and check that image list failures are shown explicitly; do not overwrite state on upstream read errors.

## Activation gate

Current experiment is intentionally **read-only with local editing**. Before enabling any remote write, add integration tests against a separate gallery **staging** backend, inspect the independent project's published schema and auth flow, and obtain confirmation on which new gallery API handles authoritative mutations. Keep production blog and imagebed untouched during rollout.
