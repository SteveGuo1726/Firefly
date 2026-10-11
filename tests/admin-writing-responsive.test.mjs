import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("mobile article writer keeps title and draft toggle, with metadata collapsible", async () => {
 const src=await readFile("src/components/pages/admin/AdminPostManager.svelte","utf8");
 assert.match(src, /<label class="editor-title">/);
 assert.match(src, /<details class="post-metadata">/);
 assert.match(src, /<summary><span>文章信息与其他设置/);
 assert.match(src, /<label class="body"><span>正文 Markdown \/ MDX/);
 assert.match(src, /\.editor \.body textarea\{[^}]*height:clamp\(35rem,67vh,58rem\)/);
});

test("phone, tablet and desktop preserve responsive source and preview sizing",async()=>{
 const src=await readFile("src/components/pages/admin/AdminPostManager.svelte","utf8");
 for(const width of [1350,900,640,360])assert.ok(src.includes(`max-width:${width}px`));
 assert.match(src,/\.layout\.docked\{display:flex;flex-direction:column/);
 assert.match(src,/\.layout\.docked>\.editor>\.body textarea\{height:46dvh/);
 assert.match(src,/\.layout\.docked>\.preview>\.preview-viewport\{height:43dvh/);
});

test("admin grid cannot stretch entire page to content min-width",async()=>{
 const app=await readFile("src/components/pages/admin/AdminApp.svelte","utf8");
 assert.match(app,/\.admin-shell\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(app,/\.admin-heading>div,\.identity,\.identity span\{min-width:0/);
 const editor=await readFile("src/components/pages/admin/AdminPostManager.svelte","utf8");
 assert.match(editor,/\.manager,\.layout,\.layout>aside,\.layout>\.editor/);
 assert.match(editor,/\.editor \.body textarea\{display:block;box-sizing:border-box;min-width:0/);
});
