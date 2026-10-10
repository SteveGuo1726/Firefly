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


test("public post discovery refreshes and restores temporarily hidden static entries",async()=>{
 const discover=await readFile("src/components/pages/post/LivePostDiscover.svelte","utf8");
 assert.match(discover,/card\.hidden = hidden/);
 assert.doesNotMatch(discover,/card\.remove\(\)/);
 assert.match(discover,/addEventListener\("storage", onStorage\)/);
 assert.match(discover,/removeEventListener\("storage", onStorage\)/);
 assert.match(discover,/visibilitychange/);
 assert.match(discover,/pageshow/);
 assert.match(discover,/livePostsUpdated/);
});
test("live post search invalidates stale index on cross-tab mutation",async()=>{
 const search=await readFile("src/utils/live-post-search.ts","utf8");
 assert.match(search,/invalidateLivePostSearchIndex/);
 assert.match(search,/firefly:live-content-updated/);
 assert.match(search,/liveIndexCache\.clear\(\)/);
 assert.match(search,/Date\.now\(\) \+ 5_000/);
});


test("independent admin lazily loads editors only after verified login", async () => {
 const app=await readFile("src/components/pages/admin/AdminApp.svelte","utf8");
 assert.match(app,/if\s*\(!session\)/);
 assert.match(app,/import\("\.\/AdminPostManager\.svelte"\)/);
 assert.match(app,/import\("\.\/AdminDynamicManager\.svelte"\)/);
 assert.match(app,/import\("\.\.\/gallery\/GalleryAdminManager\.svelte"\)/);
 assert.doesNotMatch(app,/^import\s+Admin(?:Post|Dynamic)Manager\s+from/m);
});
test("switching admin sections preserves unsaved editor instances", async () => {
 const app=await readFile("src/components/pages/admin/AdminApp.svelte","utf8");
 assert.match(app,/hidden=\{section!=="posts"\}/);
 assert.match(app,/hidden=\{section!=="dynamic"\}/);
 assert.match(app,/hidden=\{section!=="gallery"\}/);
 assert.match(app,/section==="gallery"/);
});
test("legacy gallery manager is only a migration redirect, not a public editor", async () => {
 const legacy=await readFile("src/pages/gallery/manage.astro","utf8");
 assert.match(legacy,/\/admin\/\?section=gallery/);
 assert.doesNotMatch(legacy,/GalleryAdminManager|client:only/);
 const login=await readFile("src/components/features/GitHubAdminLogin.svelte","utf8");
 assert.match(login,/\/admin\/\?section=gallery/);
});
test("legacy persistent browser tokens cannot be silently restored",async()=>{
 const session=await readFile("src/utils/admin/github-session.ts","utf8");
 assert.match(session,/discardLegacyPersistentToken/);
 assert.doesNotMatch(session,/sessionStorage\.setItem\(STORAGE_KEY,\s*legacy\)/);
 assert.match(session,/localStorage\.removeItem\(LEGACY_STORAGE_KEY\)/);
});


test("all transitional GitHub administrator entry points fail closed on unknown write permission", async()=>{
 const gallery=await readFile("worker/index.ts","utf8");
 const login=await readFile("src/utils/admin/github-session.ts","utf8");
 const service=await readFile("src/server/live-content/service.js","utf8");
 assert.match(gallery,/repo\.permissions\?\.push !== true/);
 assert.match(login,/repository\.permissions\?\.push !== true/);
 assert.match(service,/repository\?\.permissions\?\.push !== true/);
});

test("gallery lightbox uses a single delegated Fancybox v6 opener",async()=>{
 const gallery=await readFile("src/components/pages/gallery/GalleryAlbumRuntime.svelte","utf8");
 const styles=await readFile("src/styles/fancybox-custom.css","utf8");
 assert.match(gallery,/Fancybox\.bind\(root, photoSelector, lightboxOptions\)/);
 assert.match(gallery,/Fancybox\.unbind\(root, photoSelector\)/);
 assert.doesNotMatch(gallery,/fromTriggerEl|onclick=\{openPhoto\}/);
 assert.match(styles,/\.fancybox__container \.f-button/);
 assert.doesNotMatch(styles,/\.fancybox__button/);
 assert.doesNotMatch(styles,/\.fancybox__container \.fancybox__image/);
});

test("lazy Fancybox import never binds after album unmount",async()=>{
 const source=await readFile("src/components/pages/gallery/GalleryAlbumRuntime.svelte","utf8");
 assert.match(source,/if \(!disposed\) Fancybox\.bind/);
 assert.match(source,/disposed = true/);
 assert.match(source,/Fancybox\.unbind\(root, photoSelector\)/);
});

test("private editors restore drafts and clear drafts only on successful mutations",async()=>{
 for(const [file,kind] of [
  ["src/components/pages/admin/AdminPostManager.svelte","post"],
  ["src/components/pages/admin/AdminDynamicManager.svelte","dynamic"],
 ]){
  const content=await readFile(file,"utf8");
  assert.match(content,/readDraft\(store,/);
  assert.match(content,/writeDraft\(store,/);
  assert.match(content,/clearDraft\(window.sessionStorage,/);
  assert.match(content,/window\.addEventListener\("pagehide",persist\)/);
  assert.match(content,/window\.removeEventListener\("pagehide",persist\)/);
  assert.doesNotMatch(content,/localStorage\.setItem\(/);
  assert.ok(content.includes('"'+kind+'"'));
 }
});

test("both content managers expose authenticated history and safe revision restore",async()=>{
 const api=await readFile("src/server/live-content/service.js","utf8");
 const client=await readFile("src/utils/admin/live-content-client.ts","utf8");
 assert.match(api,/async function handleHistory/);
 assert.match(api,/async function handleRestore/);
 assert.match(api,/path === "\/restore"/);
 assert.match(api,/path === "\/history"/);
 assert.match(client,/fetchLiveContentHistory/);
 assert.match(client,/restoreLiveContentRevision/);
 for(const name of ["AdminPostManager","AdminDynamicManager"]){
  const editor=await readFile("src/components/pages/admin/"+name+".svelte","utf8");
  assert.match(editor,/async function loadHistory/);
  assert.match(editor,/async function restoreHistory/);
  assert.match(editor,/historyRevision/);
  assert.match(editor,/guardUnsaved\(\)/);
 }
});
test("lightbox photo detail captions are HTML escaped",async()=>{
 const gallery=await readFile("src/components/pages/gallery/GalleryAlbumRuntime.svelte","utf8");
 assert.match(gallery,/safeCaption\(photo.name, photo.width, photo.height, photo.size\)/);
 assert.match(gallery,/replaceAll\("<", "&lt;"\)/);
 assert.match(gallery,/caption: true/);
});

test("deleted post and moment records are recoverable from the admin UI",async()=>{
 for(const filename of ["AdminPostManager.svelte","AdminDynamicManager.svelte"]){
  const source=await readFile("src/components/pages/admin/"+filename,"utf8");
  assert.match(source,/deletedRows\.push\(/);
  assert.match(source,/async function openDeleted/);
  assert.match(source,/已删除 \(\{deletedRows\.length\}\)/);
  assert.match(source,/await loadHistory\(\)/);
  assert.match(source,/restoreLiveContentRevision/);
 }
});

test("authenticated CMS has lazy overview and private backup without public editor bundles",async()=>{
 const app=await readFile("src/components/pages/admin/AdminApp.svelte","utf8");
 const overview=await readFile("src/components/pages/admin/AdminDashboard.svelte","utf8");
 const backup=await readFile("src/components/pages/admin/AdminBackup.svelte","utf8");
 assert.match(app,/import\("\.\/AdminDashboard\.svelte"\)/);
 assert.match(app,/import\("\.\/AdminBackup\.svelte"\)/);
 assert.match(app,/section==="backup"/);
 assert.match(overview,/fetchLiveContentIndex\("post",session\)/);
 assert.match(overview,/fetchLiveContentIndex\("dynamic",session\)/);
 assert.match(backup,/exportLiveContent\(session\)/);
 assert.match(backup,/URL\.createObjectURL/);
 assert.doesNotMatch(backup,/GitHub.*commit|fetch\("https:\/\/api\.github\.com/);
});
test("OAuth admin UI keeps bearer tokens out of browser sessions and uses same-origin APIs",async()=>{
 const sessions=await readFile("src/utils/admin/github-session.ts","utf8");
 const manager=await readFile("src/components/pages/admin/AdminApp.svelte","utf8");
 const galleryClient=await readFile("src/utils/admin/imagebed-client.ts","utf8");
 const contentClient=await readFile("src/utils/admin/live-content-client.ts","utf8");
 assert.match(sessions,/oauthSupported/);
 assert.match(sessions,/refreshOAuthAdminSession/);
 assert.match(sessions,/if\(oauthSupported\) return/);
 assert.match(manager,/refreshOAuthAdminSession\(\)/);
 assert.match(galleryClient,/session\?\.oauth/);
 assert.match(contentClient,/options\.session\.oauth/);
});

test("recovered editor drafts retain revision and base Git identity instead of becoming unsafely new documents",async()=>{
 for(const file of ["AdminPostManager.svelte","AdminDynamicManager.svelte"]){
  const component=await readFile("src/components/pages/admin/"+file,"utf8");
  assert.match(component,/JSON\.stringify\(\{currentId,currentPath,loadedPath,baseGitSha,liveRevision,originalSource/);
  assert.match(component,/currentId=typeof draft\.currentId/);
  assert.match(component,/baseGitSha=typeof draft\.baseGitSha/);
  assert.match(component,/liveRevision=typeof draft\.liveRevision/);
  assert.match(component,/originalSource=typeof draft\.originalSource/);
 }
});

test("public static management index excludes draft and protected metadata",async()=>{
 const source=await readFile("src/pages/api/admin-content-index.json.ts","utf8");
 assert.match(source,/filter\(\(post\)=>!post\.data\.draft && !post\.data\.protected\)/);
 assert.doesNotMatch(source,/draft:post\.data\.draft/);
});

test("live-content internal failures never expose provider keys or storage exception text",async()=>{
 const source=await readFile("src/server/live-content/service.js","utf8");
 assert.match(source,/console\.error\("\[Firefly live content\]", error\)/);
 assert.doesNotMatch(source,/error: error instanceof Error \? error\.message : "Live content service failed\."/);
});
test("backup verifies all pointer revisions and full document sources before successful response",async()=>{
 const service=await readFile("src/server/live-content/service.js","utf8");
 const backup=await readFile("src/components/pages/admin/AdminBackup.svelte","utf8");
 assert.match(service,/Backup integrity failure: missing or mismatched/);
 assert.match(service,/typeof item\.source !== "string"/);
 assert.match(backup,/备份完整性校验失败/);
});

test("gallery admin prevents destructive refresh and overlapping upload/save",async()=>{
 const source=await readFile("src/components/pages/gallery/GalleryAdminManager.svelte","utf8");
 assert.match(source,/dirty && !confirm\("相册有尚未保存的修改/);
 assert.match(source,/if \(saving \|\| uploading \|\| loading \|\| !dirty\) return/);
 assert.match(source,/if \(uploading \|\| saving\) return/);
 assert.match(source,/disabled=\{!dirty \|\| loading \|\| saving \|\| uploading\}/);
});

test("private CMS post index restores unpublished Git baselines without exposing them in prerender",async()=>{
 const privateIndex=await readFile("src/utils/admin/private-content-index.ts","utf8");
 const manager=await readFile("src/components/pages/admin/AdminPostManager.svelte","utf8");
 const publicIndex=await readFile("src/pages/api/admin-content-index.json.ts","utf8");
 assert.match(privateIndex,/fetchPrivatePostIndex/);
 assert.match(privateIndex,/GitHub 文件树不完整/);
 assert.match(privateIndex,/fetchGitContentSource\(session,path\)/);
 assert.match(manager,/await fetchPrivatePostIndex\(session,base\.posts as BasePost\[\]\)/);
 assert.match(publicIndex,/!post\.data\.draft && !post\.data\.protected/);
});

test("private post index is required by editor and dashboard, and OAuth route is session guarded",async()=>{
 const [editor,dashboard,client,route]=await Promise.all([
  readFile("src/components/pages/admin/AdminPostManager.svelte","utf8"),
  readFile("src/components/pages/admin/AdminDashboard.svelte","utf8"),
  readFile("src/utils/admin/private-content-index.ts","utf8"),
  readFile("cloud-functions/api/admin/private-index.js","utf8"),
 ]);
 assert.match(editor,/fetchPrivatePostIndex\(session/);
 assert.match(dashboard,/fetchPrivatePostIndex\(session/);
 assert.match(client,/credentials:"same-origin"/);
 assert.match(route,/verifySession\(token\)/);
 assert.match(route,/FIREFLY_GITHUB_CONTENT_READ_TOKEN/);
 assert.match(route,/Cache-Control":"private, no-store"/);
});
