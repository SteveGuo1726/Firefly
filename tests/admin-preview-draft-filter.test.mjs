import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("article draft filters declare reactive dependencies",async()=>{
 const src=await readFile("src/components/pages/admin/AdminPostManager.svelte","utf8");
 assert.match(src,/function filtered\(data:Row\[\],text:string,status:"all"\|"drafts"\|"published"\)/);
 assert.match(src,/\{#each filtered\(rows,query,listFilter\) as row\}/);
 assert.match(src,/草稿 \{rows\.filter\(row=>row\.draft\)\.length\}/);
 assert.match(src,/已发布 \{rows\.filter\(row=>!row\.draft\)\.length\}/);
});

test("preview host uses authenticated same-origin article source",async()=>{
 const reader=await readFile("src/utils/admin/github-content-reader.ts","utf8");
 const privateIndex=await readFile("src/utils/admin/private-content-index.ts","utf8");
 assert.match(reader,/window\.location\.hostname==="v1-preview\.casto\.top"/);
 assert.match(reader,/\/api\/admin\/content-source\?path=/);
 assert.match(privateIndex,/refreshGit\?"\?refresh=1":""/);
});
