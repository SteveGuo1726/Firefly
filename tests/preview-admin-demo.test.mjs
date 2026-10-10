import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("preview authentication UI is scoped to preview build and exact host", async () => {
 const source=await readFile("src/components/pages/admin/AdminApp.svelte","utf8");
 assert.match(source,/PUBLIC_FIREFLY_PREVIEW_DEMO === "true"/);
 assert.match(source,/firefly-blog-preview\.guojunyang666666\.workers\.dev/);
 assert.doesNotMatch(source,/demoPassword !== "admin"/);
 assert.match(source,/previewPasswordLogin/);
 assert.match(source,/enterPreviewAdmin/);
 assert.match(source,/demoSupported=PREVIEW_DEMO_COMPILED && previewOriginAllowed\(\)/);
 assert.match(source,/sessionStorage\.setItem\(DEMO_STORAGE_KEY,"1"\)/);
 assert.match(source,/sessionStorage\.removeItem\(DEMO_STORAGE_KEY\)/);
 assert.match(source,/if\(demoSupported\)\{/);
 assert.match(source,/refreshOAuthAdminSession/);
 assert.match(source,/GitHubAdminLogin/);
});

test("password demo cannot load private admin editors or write data", async () => {
 const demo=await readFile("src/components/pages/admin/PreviewDemoAdmin.svelte","utf8");
 assert.match(demo,/只读演示/);
 assert.match(demo,/fetchPublicGallery\("",true\)/);
 assert.match(demo,/createGalleryManifestBackup/);
 assert.match(demo,/inspectGalleryManifest/);
 assert.match(demo,/下载公开清单 JSON/);
 assert.match(demo,/\/api\/admin-content-index\.json/);
 assert.match(demo,/\/api\/live-content\/index\?kind/);
 assert.match(demo,/不提供远端保存/);
 assert.doesNotMatch(demo,/(?:fetch|axios)\s*\(\s*["'`][^"'`]*(?:\/api\/admin\/|\/api\/live-content\/(?:item|export|history|restore)|\/api\/gallery\/manifest)/);
 assert.doesNotMatch(demo,/(?:method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["'])/i);
 assert.doesNotMatch(demo,/github-session|utils\/admin\/imagebed-client|fetchPrivatePostIndex|AdminPostManager|AdminDynamicManager|GalleryAdminManager|Authorization|Bearer/i);
});

test("public demo does not appear in production builds without explicit preview flag", async () => {
 const workflow=await readFile(".github/workflows/preview-check.yml","utf8");
 const source=await readFile("src/components/pages/admin/AdminApp.svelte","utf8");
 assert.match(source,/PREVIEW_DEMO_COMPILED/);
 assert.match(source,/previewOriginAllowed/);
 assert.doesNotMatch(workflow,/github\.ref.*master/);
});


test("sandbox demo only accepts the exact configured development hostname", async () => {
 const app = await readFile("src/components/pages/admin/AdminApp.svelte","utf8");
 assert.match(app,/PUBLIC_FIREFLY_SANDBOX_HOST/);
 assert.match(app,/SANDBOX_PREVIEW_HOST !== ""/);
 assert.match(app,/import\.meta\.env\.DEV/);
 assert.match(app,/window\.location\.hostname === SANDBOX_PREVIEW_HOST/);
});


test("persistent v1 preview exposes password login without the sandbox demo flag", async () => {
 const app=await readFile("src/components/pages/admin/AdminApp.svelte","utf8");
 assert.match(app,/v1-preview\.casto\.top/);
 assert.match(app,/previewPasswordLogin=PREVIEW_HOSTS\.has\(window\.location\.hostname\)/);
 assert.doesNotMatch(app,/previewPasswordLogin=demoSupported/);
 assert.match(app,/fetch\("\/api\/preview-admin\/login"/);
});
