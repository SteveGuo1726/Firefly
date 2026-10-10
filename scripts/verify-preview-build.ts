// Post-build guard shared by local, Cloudflare, EdgeOne, Netlify and Vercel builds.
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { resolveSiteRoot } from "./site-root";

const root = resolveSiteRoot();
const required = [
  "index.html",
  "archive/index.html",
  "search/index.html",
  "gallery/index.html",
  "gallery/manage/index.html",
  "friends/index.html",
  "bilibili/index.html",
  "bangumi/index.html",
  "dynamic/index.html",
  "booknav/index.html",
  "projects/index.html",
  "write/index.html",
  "admin/index.html",
  "internal/live-post-shell/index.html",
  "posts/firefly-config-manager/index.html",
  "pagefind/pagefind.js",
  "favicon/favicon-light-32.png",
  "rss.xml",
  "atom.xml",
  "sitemap-index.xml",
  "404.html",
];

const errors: string[] = [];

const inlineCss = await readFile(
  path.join(process.cwd(), "src/styles/markdown.css"),
  "utf8",
);
if (!inlineCss.includes(":not(pre) > code")) {
  errors.push("code block and inline code selectors overlap");
}
if (/counter-reset:\s*line\b|span\.line\s*\{/.test(inlineCss)) {
  errors.push("legacy synthetic line-number rules conflict with Expressive Code");
}

for (const relative of required) {
  const file = path.join(root, relative);
  try {
    const entry = await stat(file);
    if (!entry.isFile() || entry.size === 0) {
      errors.push(relative + " is empty or not a file");
    }
  } catch {
    errors.push(relative + " missing");
  }
}

const home = await readFile(path.join(root, "index.html"), "utf8").catch(() => "");
if (!home.includes("--font-code:")) {
  errors.push("home page is missing upstream --font-code fallback");
}
if (!home.includes('id="navbar"')) {
  errors.push("home page is missing its navbar");
}
if (!home.includes("data-local-fallback")) {
  errors.push("home page is missing random-cover local fallback");
}

const codeGuide = await readFile(
  path.join(process.cwd(), "src/content/posts/firefly-config-manager.md"),
  "utf8",
).catch(() => "");
const codeFence = new RegExp(
  "^" +
    String.fromCharCode(96).repeat(3) +
    "text[ \\t]*\\n([\\s\\S]*?)^" +
    String.fromCharCode(96).repeat(3) +
    "[ \\t]*$",
  "gm",
);
const guideExamples = [...codeGuide.matchAll(codeFence)];
if (
  guideExamples.length !== 3 ||
  guideExamples.some(
    (match) => match[1].startsWith("\n") || match[1].endsWith("\n\n"),
  )
) {
  errors.push("metadata guide contains empty code-block lines");
}

const codeStyle = await readFile(
  path.join(process.cwd(), "src/styles/expressive-code.css"),
  "utf8",
).catch(() => "");
if (
  !codeStyle.includes(".custom-md .expressive-code .frame pre") ||
  !codeStyle.includes("white-space: pre;") ||
  !codeStyle.includes("overflow-x: auto")
) {
  errors.push("mobile code block style guard missing");
}

const adminConfig = await readFile(
  path.join(process.cwd(), "src/config/githubAdminConfig.ts"),
  "utf8",
).catch(() => "");
if (
  !adminConfig.includes("PUBLIC_GITHUB_ADMIN_BRANCH") ||
  !adminConfig.includes('|| "master"')
) {
  errors.push("GitHub admin branch is not preview-overridable with master fallback");
}

const searchSource = await readFile(
  path.join(process.cwd(), "src/pages/search.astro"),
  "utf8",
).catch(() => "");
if (searchSource.includes("pagefind/pagefind.js")) {
  errors.push("search page duplicates the global Pagefind loader");
}

const navbarSource = await readFile(
  path.join(process.cwd(), "src/components/layout/Navbar.astro"),
  "utf8",
).catch(() => "");
if (navbarSource.includes("method: 'HEAD'")) {
  errors.push("global Pagefind loader still performs a redundant HEAD probe");
}

const backToTopSource = await readFile(
  path.join(process.cwd(), "src/components/controls/BackToTop.astro"),
  "utf8",
).catch(() => "");
if (
  (backToTopSource.match(/DOMContentLoaded/g) || []).length !== 1 ||
  !backToTopSource.includes("updateVisibility();")
) {
  errors.push("back-to-top initialization guard regressed");
}

const twikooSource = await readFile(
  path.join(process.cwd(), "src/components/comment/Twikoo.astro"),
  "utf8",
).catch(() => "");
if (
  !twikooSource.includes("__twikooSwupHookInit") ||
  !twikooSource.includes('document.readyState === "loading"')
) {
  errors.push("Twikoo Swup initialization guard missing");
}

const galleryWorkerSource = await readFile(
  path.join(process.cwd(), "worker/index.ts"),
  "utf8",
).catch(() => "");
if (!galleryWorkerSource.includes("repo.permissions?.push !== true")) {
  errors.push("gallery admin API does not verify repository write permission");
}

const adminShellSource = await readFile(
  path.join(process.cwd(), "src/components/pages/admin/AdminApp.svelte"),
  "utf8",
).catch(() => "");
const galleryManageSource = await readFile(
  path.join(process.cwd(), "src/pages/gallery/manage.astro"),
  "utf8",
).catch(() => "");
if (
  !adminShellSource.includes('import("./AdminPostManager.svelte")') ||
  !adminShellSource.includes('import("./AdminDynamicManager.svelte")') ||
  !adminShellSource.includes('import("../gallery/GalleryAdminManager.svelte")') ||
  galleryManageSource.includes("GalleryAdminManager")
) {
  errors.push("private admin modules must be lazy and legacy gallery manager redirected");
}
if (navbarSource.includes("GitHubAdminLogin")) {
  errors.push("public navbar must not bundle administrator login");
}

const oauthCallbackSource = await readFile(
  path.join(process.cwd(), "cloud-functions/api/admin/auth/[[default]].js"),
  "utf8",
).catch(() => "");
const galleryProxySource = await readFile(
  path.join(process.cwd(), "src/server/admin-auth/gallery-proxy.js"),
  "utf8",
).catch(() => "");
const gallerySessionSource = await readFile(
  path.join(process.cwd(), "src/utils/admin/github-session.ts"),
  "utf8",
).catch(() => "");
if (
  !oauthCallbackSource.includes("FIREFLY_OAUTH_CLIENT_SECRET") ||
  !oauthCallbackSource.includes("assertEdgeOneAtomicWrites") ||
  !galleryProxySource.includes("FIREFLY_GALLERY_SERVICE_SECRET") ||
  !galleryProxySource.includes("sessionService") && !galleryProxySource.includes("createAdminSessionService") ||
  !gallerySessionSource.includes("refreshOAuthAdminSession")
) {
  errors.push("OAuth server, same-origin gallery bridge or session guards missing");
}
if (!galleryWorkerSource.includes("FIREFLY_ADMIN_SERVICE_SECRET")) {
  errors.push("gallery worker must validate a service-to-service secret before OAuth management");
}

const dynamicPageSource = await readFile(
  path.join(process.cwd(), "src/pages/dynamic/index.astro"),
  "utf8",
).catch(() => "");
if (dynamicPageSource.includes("DynamicAdminManager")) {
  errors.push("public dynamic page still mounts the legacy admin manager");
}

const writePageSource = await readFile(
  path.join(process.cwd(), "src/pages/write.astro"),
  "utf8",
).catch(() => "");
if (/import\s+WriteManager\b|<WriteManager\b/.test(writePageSource)) {
  errors.push("legacy WriteManager is still mounted");
}

const livePostOverlaySource = await readFile(
  path.join(process.cwd(), "src/components/pages/post/LivePostOverlay.svelte"),
  "utf8",
).catch(() => "");
if (
  !livePostOverlaySource.includes("/api/live-content/item?kind=post") ||
  !livePostOverlaySource.includes("[data-live-post-content]")
) {
  errors.push("live post overlay guard missing");
}

const livePostFunctionSource = await readFile(
  path.join(process.cwd(), "cloud-functions/posts/[[default]].js"),
  "utf8",
).catch(() => "");
if (!livePostFunctionSource.includes("renderLivePostFallback")) {
  errors.push("EdgeOne missing-post live fallback is missing");
}

const livePostShellSource = await readFile(
  path.join(process.cwd(), "src/pages/internal/live-post-shell.astro"),
  "utf8",
).catch(() => "");
const livePostRendererSource = await readFile(
  path.join(process.cwd(), "src/server/live-content/render-live-post.js"),
  "utf8",
).catch(() => "");
if (
  !livePostShellSource.includes('data-live-post-comments-boundary="start"') ||
  !livePostRendererSource.includes("data-live-post-comments-boundary")
) {
  errors.push("live post comment boundary guard missing");
}

const cloudflarePreviewConfig = await readFile(
  path.join(process.cwd(), "wrangler.preview.jsonc"),
  "utf8",
).catch(() => "");
if (
  !cloudflarePreviewConfig.includes('"name": "firefly-blog-preview"') ||
  !cloudflarePreviewConfig.includes('"LIVE_CONTENT_PREVIEW"') ||
  !cloudflarePreviewConfig.includes('"/api/live-content/*"')
) {
  errors.push("Cloudflare preview live-content adapter config missing");
}

const archiveWorkflowSource = await readFile(
  path.join(process.cwd(), ".github/workflows/live-content-archive.yml"),
  "utf8",
).catch(() => "");
const archiveScriptSource = await readFile(
  path.join(process.cwd(), "scripts/archive-live-content.mjs"),
  "utf8",
).catch(() => "");
if (
  !archiveWorkflowSource.includes("FIREFLY_ARCHIVE_ALLOW_MASTER") ||
  !archiveWorkflowSource.includes(".firefly/live-content-archive-state.json") ||
  !archiveScriptSource.includes("Archive conflicts detected") ||
  !archiveScriptSource.includes("gitBlobSha")
) {
  errors.push("live content archive safety guard missing");
}

const runtimeVerifierSource = await readFile(
  path.join(process.cwd(), "scripts/verify-runtime-bundles.ts"),
  "utf8",
).catch(() => "");
if (
  !runtimeVerifierSource.includes("cloud-functions/api/live-content/[[default]].js") ||
  !runtimeVerifierSource.includes("cloud-functions/posts/[[default]].js") ||
  !runtimeVerifierSource.includes("worker/blog-preview.ts")
) {
  errors.push("runtime bundle verifier is missing EdgeOne or Cloudflare entrypoints");
}

const liveContentFunctionSource = await readFile(
  path.join(process.cwd(), "cloud-functions/api/live-content/[[default]].js"),
  "utf8",
).catch(() => "");
const liveContentServiceSource = await readFile(
  path.join(process.cwd(), "src/server/live-content/service.js"),
  "utf8",
).catch(() => "");
if (
  !liveContentFunctionSource.includes('@edgeone/pages-blob') ||
  !liveContentFunctionSource.includes('createLiveContentService') ||
  !liveContentServiceSource.includes("requireAdmin") ||
  !liveContentServiceSource.includes("sameOriginAllowed") ||
  !liveContentServiceSource.includes("v3/pointers/")
) {
  errors.push("EdgeOne live content service guard missing");
}

async function collectHtmlFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectHtmlFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(full);
    }
  }
  return files;
}

async function internalTargetExists(urlPath: string): Promise<boolean> {
  const clean = urlPath.split(/[?#]/, 1)[0];
  if (
    !clean ||
    clean === "/" ||
    clean.startsWith("//") ||
    clean.startsWith("/api/")
  ) {
    return true;
  }
  let decoded = clean;
  try {
    decoded = decodeURI(clean);
  } catch {
    // Keep the encoded path; malformed URLs will fail the filesystem checks below.
  }
  const relative = decoded.replace(/^\/+/, "");
  const direct = path.join(root, relative);
  const candidates = [
    direct,
    path.join(direct, "index.html"),
    path.join(root, relative.replace(/\/+$/, "") + ".html"),
  ];
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return true;
    } catch {
      // Try the next representation.
    }
  }
  return false;
}

const expectedAdminBranch = process.env.PUBLIC_GITHUB_ADMIN_BRANCH?.trim();
if (expectedAdminBranch) {
  const astroAssetsDir = path.join(root, "_astro");
  const assetNames = await readdir(astroAssetsDir).catch(() => []);
  let compiledBranchFound = false;
  for (const name of assetNames) {
    if (!name.endsWith(".js")) continue;
    const source = await readFile(path.join(astroAssetsDir, name), "utf8").catch(
      () => "",
    );
    if (source.includes(expectedAdminBranch)) {
      compiledBranchFound = true;
      break;
    }
  }
  if (!compiledBranchFound) {
    errors.push(
      "PUBLIC_GITHUB_ADMIN_BRANCH was not compiled into the client assets",
    );
  }
}

const brokenRefs: string[] = [];
const htmlFiles = await collectHtmlFiles(root);
for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  for (const match of html.matchAll(/(?:src|href)=["'](\/[^"'#]*)["']/g)) {
    const target = match[1];
    if (!(await internalTargetExists(target))) {
      brokenRefs.push(path.relative(root, file) + " -> " + target);
      if (brokenRefs.length >= 20) break;
    }
  }
  if (brokenRefs.length >= 20) break;
}
if (brokenRefs.length) {
  errors.push(
    "broken internal asset/route references: " + brokenRefs.join(", "),
  );
}

if (errors.length) {
  for (const error of errors) console.error("FIREFLY_BUILD_CHECK_FAIL", error);
  process.exitCode = 1;
} else {
  console.log(
    "FIREFLY_BUILD_CHECK_PASS",
    JSON.stringify({
      root,
      files: required.length,
      htmlFiles: htmlFiles.length,
      brokenInternalRefs: 0,
      fontCode: true,
      navbar: true,
      localCoverFallback: true,
    }),
  );
}
