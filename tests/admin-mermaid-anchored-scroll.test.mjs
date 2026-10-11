import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("Mermaid checks syntax before render and removes transient error SVGs",async()=>{
 const s=await readFile("src/utils/write/preview.ts","utf8");
 const parse=s.indexOf("mermaid.parse(code,{suppressErrors:true})");
 const render=s.indexOf("mermaid.render(renderId,code)");
 assert.ok(parse>0 && render>parse);
 assert.match(s,/mermaid-parse-error/);
 assert.match(s,/document.getElementById/);
});
test("renderer retains source line anchors",async()=>{
 const s=await readFile("src/utils/write/preview.ts","utf8");
 assert.match(s,/function rehypePreviewSourceAnchors/);
 assert.match(s,/data-source-line/);
 assert.ok(s.indexOf(".use(rehypePreviewSourceAnchors)")<s.indexOf(".use(deps.rehypeStringify"));
});
test("dock aligns by measured source positions and offers click-to-source",async()=>{
 const s=await readFile("src/components/pages/admin/AdminPostManager.svelte","utf8");
 for(const token of ["function measureSourceLines(","function alignPreviewToSource(","function locateSourceFromPreview(","data-source-line","setSelectionRange(charIndex,charIndex)"]) assert.ok(s.includes(token),token);
});
test("phone dock uses contained two-pane grid",async()=>{
 const s=await readFile("src/components/pages/admin/AdminPostManager.svelte","utf8");
 assert.ok(s.includes(".layout.docked{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)"));
 assert.ok(s.includes("max-width:100%;height:min(80dvh,850px)"));
});
