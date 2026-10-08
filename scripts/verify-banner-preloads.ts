// Post-build regression guard for the viewport-selected homepage hero images.
// This checks emitted HTML, not just Astro source code. No browser or paid API required.
import fs from "node:fs/promises";
import path from "node:path";
import { backgroundWallpaper } from "../src/config/backgroundWallpaper";
import { siteConfig } from "../src/config/siteConfig";
import { resolveSiteRoot } from "./site-root";

function attr(tag: string, key: string): string | undefined {
  const m = tag.match(new RegExp(`(?:^|\\s)${key}="([^"]*)"`, "i"));
  return m?.[1];
}

function fail(message: string): never {
  throw new Error(`Banner preload regression: ${message}`);
}

async function main() {
  const bannerSrc = backgroundWallpaper.src;
  if (backgroundWallpaper.mode !== "banner" ||
      siteConfig.imageOptimization?.formats !== "webp" ||
      !bannerSrc || typeof bannerSrc !== "object" || Array.isArray(bannerSrc)) {
    console.log("Banner preload check skipped: current config does not use local WebP banner pairs");
    return;
  }
  function first(v: string | string[] | undefined): string | undefined {
    return Array.isArray(v) ? v[0] : v;
  }
  const mobile = first(bannerSrc.mobile);
  const desktop = first(bannerSrc.desktop);
  if (![mobile, desktop].every(x => x?.startsWith("assets/images/"))) {
    console.log("Banner preload check skipped: non-local/custom image configuration");
    return;
  }
  const html = await fs.readFile(path.join(resolveSiteRoot(), "index.html"), "utf8");
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]);
  const check = (device: "Mobile" | "Desktop", media: string) => {
    const preload = links.find(t => attr(t, "rel") === "preload" &&
      attr(t, "as") === "image" && attr(t, "media") === media);
    if (!preload) fail(`${device} responsive preload <link> not found`);
    if (attr(preload, "fetchpriority") !== "high") fail(`${device} preload missing high priority`);
    const preloadSet = attr(preload, "imagesrcset");
    if (!preloadSet) fail(`${device} preload missing responsive imagesrcset`);
    const imgRegex = /<img\b[^>]*>/gi;
    const matches = [...html.matchAll(imgRegex)];
    const target = matches.find(m => attr(m[0], "alt") === `${device} background image of the blog`);
    if (!target) fail(`${device} banner img missing`);
    if (attr(target[0], "loading") !== "lazy") fail(`${device} first banner image must be lazy when preloaded by media`);
    const pictureStart = html.lastIndexOf("<picture", target.index);
    if (pictureStart < 0) fail(`${device} banner picture missing`);
    const sources = html.slice(pictureStart, target.index).match(/<source\b[^>]*>/gi) ?? [];
    const webpSource = sources.find(t => attr(t, "type") === "image/webp");
    if (!webpSource) fail(`${device} WebP picture source missing`);
    const imgSet = attr(webpSource, "srcset");
    const norm = (s: string | undefined) => (s ?? "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    if (norm(imgSet) !== norm(preloadSet)) {
      fail(`${device} preload imagesrcset differs from actual picture srcset (possible double download)`);
    }
    console.log(`Verified ${device} homepage banner media preload: ${media}`);
  };
  check("Mobile", "(max-width: 1023px)");
  check("Desktop", "(min-width: 1024px)");
  console.log("Homepage banner responsive preload integrity: PASS");
}
main().catch(e => { console.error(e); process.exit(1); });
