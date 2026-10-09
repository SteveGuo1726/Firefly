import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public navbar does not hydrate GitHub administrator login", async()=>{
 const source=await readFile("src/components/layout/Navbar.astro","utf8");
 assert.doesNotMatch(source,/GitHubAdminLogin|github-session/);
});
test("public gallery components never bundle management auth modules",async()=>{
 for(const path of [
  "src/components/pages/gallery/GalleryAlbumRuntime.svelte",
  "src/components/pages/gallery/GalleryBrowser.svelte",
 ]){
  const source=await readFile(path,"utf8");
  assert.match(source,/gallery-public-client/);
  assert.doesNotMatch(source,/utils\/admin\/imagebed-client|github-session|loginWithGitHubToken/);
 }
 const publicClient=await readFile("src/utils/gallery-public-client.ts","utf8");
 assert.doesNotMatch(publicClient,/github-session|utils\/admin|Bearer|sessionStorage/);
});
test("administrator login remains reachable only from admin app",async()=>{
 const source=await readFile("src/components/pages/admin/AdminApp.svelte","utf8");
 assert.match(source,/GitHubAdminLogin/);
});

test("public gallery uses bounded remote reads and prioritized images",async()=>{
 const client=await readFile("src/utils/gallery-public-client.ts","utf8");
 assert.match(client,/AbortSignal\.timeout\(timeoutMs\)/);
 const album=await readFile("src/components/pages/gallery/GalleryAlbumRuntime.svelte","utf8");
 assert.match(album,/fetchpriority="high"/);
 assert.match(album,/fetchpriority="low"/);
 const browser=await readFile("src/components/pages/gallery/GalleryBrowser.svelte","utf8");
 assert.match(browser,/fetchpriority="low"/);
});

test("public dynamic feed refreshes live overlays when returning to the tab",async()=>{
 const source=await readFile("src/components/pages/dynamic/DynamicFeed.svelte","utf8");
 assert.match(source,/cache: "no-store"/);
 assert.match(source,/visibilitychange/);
 assert.match(source,/pageshow/);
 assert.match(source,/refreshIfStale/);
 assert.match(source,/if \(!background \|\| entries\.length === 0\) failed = true/);
});

test("successful content writes notify open public tabs without rebuilds",async()=>{
 const client=await readFile("src/utils/admin/live-content-client.ts","utf8");
 const feed=await readFile("src/components/pages/dynamic/DynamicFeed.svelte","utf8");
 assert.match(client,/firefly:live-content-updated/);
 assert.equal((client.match(/announceLiveMutation\(options.kind\)/g)||[]).length,2);
 assert.match(feed,/addEventListener\("storage", onContentChanged\)/);
 assert.match(feed,/removeEventListener\("storage", onContentChanged\)/);
 assert.match(feed,/JSON.parse\(event.newValue\)\?\.kind === "dynamic"/);
});

test("article overlay refreshes live content after returning and admin cross-tab updates",async()=>{
 const overlay=await readFile("src/components/pages/post/LivePostOverlay.svelte","utf8");
 assert.match(overlay,/cache: "no-store"/);
 assert.match(overlay,/firefly:live-content-updated/);
 assert.match(overlay,/JSON.parse\(event.newValue\)\?\.kind === "post"/);
 assert.match(overlay,/visibilitychange/);
 assert.match(overlay,/pageshow/);
 assert.match(overlay,/removeEventListener\("storage", onStorage\)/);
 assert.match(overlay,/if \(busy \|\| disposed\) return/);
});
