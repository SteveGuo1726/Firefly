import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(root,p),"utf8");

test("global navigation exposes accessible, direct admin icon",()=>{
 const navbar=read("src/components/layout/Navbar.astro");
 assert.match(navbar,/href=\{url\("\/admin\/"\)\}/);
 assert.match(navbar,/aria-label="进入内容管理后台"/);
 assert.match(navbar,/data-admin-entry/);
 assert.match(navbar,/admin-panel-settings-outline/);
});
test("gallery route selector exposes three accessible persistent choices",()=>{
 const gallery=read("src/components/pages/gallery/GalleryBrowser.svelte");
 for(const route of ['value:"auto"','value:"cloudflare"','value:"original"'])
  assert.ok(gallery.includes(route),"Missing gallery route: "+route);
 assert.match(gallery,/role="group" aria-label="选择图片加载线路"/);
 assert.match(gallery,/aria-pressed=\{imageRoute===option.value\}/);
 assert.match(gallery,/saveGalleryRoute\(next\)/);
 assert.doesNotMatch(gallery,/<select id="gallery-image-route"/);
 assert.match(gallery,/prefers-reduced-motion/);
});
test("README describes real production, credits Firefly and uses existing assets",()=>{
 const readme=read("README.md");
 assert.match(readme,/星遐蝶梦/);
 assert.match(readme,/https:\/\/blog\.casto\.top/);
 assert.match(readme,/腾讯云 EdgeOne Pages/);
 assert.match(readme,/CuteLeaf \/ Firefly/);
 assert.match(readme,/master/);
 assert.doesNotMatch(readme,/github\.com\/CuteLeaf\/Firefly\/stargazers/);
 for(const ref of readme.matchAll(/src="(\.\/[^"]+)"/g))
  assert.ok(existsSync(path.join(root,ref[1])),"Missing README image: "+ref[1]);
});
test("obsolete local backups and probe files are absent",()=>{
 for(const filename of [
  ".firefly-config-manager-backups",".write-dev.err.log",".write-dev.out.log",
  ".github/workflows/edgeone-blob-probe.yml",
  ".github/workflows/edgeone-readonly-diagnosis.yml",
  "scripts/china-three-isp-probe.mjs",
  "scripts/probe-edgeone-blob.ts",
 ]) assert.equal(existsSync(path.join(root,filename)),false,"Obsolete path: "+filename);
});
