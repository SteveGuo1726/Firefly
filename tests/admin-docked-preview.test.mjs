import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const editor = () => readFile("src/components/pages/admin/AdminPostManager.svelte", "utf8");

test("paired preview has reversible source and preview scroll synchronization", async () => {
  const code = await editor();
  assert.match(code, /function syncDockedScroll\(from:"source"\|"preview"\)/);
  assert.match(code, /origin\.scrollTop\/maxOrigin\*maxTarget/);
  assert.match(code, /onscroll=\{\(\)=>syncDockedScroll\("source"\)\}/);
  assert.match(code, /onscroll=\{\(\)=>syncDockedScroll\("preview"\)\}/);
  assert.match(code, /class:docked=\{dockedPreview\}/);
  assert.match(code, /aria-pressed=\{dockedPreview\}/);
});

test("mobile close preview retains paired columns without page overflow", async () => {
  const code = await editor();
  assert.match(code, /\.layout\.docked\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(code, /\.layout\.docked>aside\{display:none\}/);
  assert.match(code, /\.layout\.docked>\.preview>\.preview-viewport\{flex:1/);
});

test("article preview imports production markdown styles and cover treatment", async () => {
  const code = await editor();
  assert.match(code, /import "\@\/styles\/markdown-extend\.styl"/);
  assert.match(code, /processCoverImageSync\(fields\.image/);
  assert.match(code, /getApiUrlList\(fields\.image/);
  assert.match(code, /fallbackCover\.src/);
  assert.match(code, /src=\{previewCoverUrl\(\)\}/);
});
