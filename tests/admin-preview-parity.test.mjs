import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("admin article preview preserves production Markdown styling in both views",async()=>{
 const src=await readFile("src/components/pages/admin/AdminPostManager.svelte","utf8");
 assert.equal((src.match(/markdown-content" bind:this=\{previewRoot\}/g)||[]).length,2);
 assert.match(src,/enhanceFireflyPreview/);
});
test("multifunction preview shares key production Markdown plugins",async()=>{
 const preview=await readFile("src/utils/write/preview.ts","utf8");
 const astro=await readFile("astro.config.mjs","utf8");
 for(const name of ["rehype-code-group","remark-admonition-to-blockquote-callout"]){
  assert.ok(preview.includes(name),`missing preview plugin ${name}`);
  assert.ok(astro.includes(name),`production missing plugin ${name}`);
 }
 assert.match(preview,/\.use\(deps\.codeGroup\)/);
 assert.match(preview,/\.use\(deps\.admonition\)/);
 assert.match(preview,/\.use\(deps\.rehypeKatex\)/);
 assert.match(preview,/enhanceMermaid\(options\.container\)/);
});
