import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("article editor keeps desktop, tablet and mobile authoring breakpoints", async () => {
 const source = await readFile("src/components/pages/admin/AdminPostManager.svelte","utf8");
 assert.match(source,/max-width:1350px/);
 assert.match(source,/max-width:760px/);
 assert.match(source,/max-width:390px/);
 assert.match(source,/\.layout\{display:flex;flex-direction:column/);
 assert.match(source,/\.list\{display:flex;overflow-x:auto/);
 assert.match(source,/\.preview-viewport :global\(pre\)/);
});
