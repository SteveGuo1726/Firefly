import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("article editor enhances rendered body in both preview presentation modes",async()=>{
 const source=await readFile("src/components/pages/admin/AdminPostManager.svelte","utf8");
 assert.match(source,/enhanceFireflyPreview/);
 assert.match(source,/postFilePath:currentPath/);
 assert.match(source,/repoConfig:\{owner:"SteveGuo1726",repo:"Firefly"/);
 assert.equal((source.match(/bind:this=\{previewRoot\} data-preview-body/g)||[]).length,2);
 assert.match(source,/onReady:html=>\{previewHtml=html;previewLoading=false;previewFailure="";void enhanceArticlePreview\(\)/);
});

test("preview enhancement checks version before DOM changes and invalidates stale work",async()=>{
 const source=await readFile("src/components/pages/admin/AdminPostManager.svelte","utf8");
 assert.match(source,/version!==previewEnhancementVersion/);
 assert.match(source,/onBusy:\(\)=>\{\+\+previewEnhancementVersion/);
 assert.match(source,/await tick\(\)/);
});

test("preview image enhancer preserves original URLs and resolves repo-relative images",async()=>{
 const source=await readFile("src/utils/write/preview.ts","utf8");
 assert.match(source,/function enhanceImages\(/);
 assert.match(source,/resolvePreviewAssetUrl\(/);
 assert.match(source,/enhanceImages\(options.container, options\)/);
 assert.match(source,/image.referrerPolicy = "no-referrer"/);
});
