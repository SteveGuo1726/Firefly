import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("article editor includes real production GitHub card styling", async () => {
  const editor = await readFile("src/components/pages/admin/AdminPostManager.svelte", "utf8");
  const styles = await readFile("src/styles/markdown-extend.styl", "utf8");
  assert.match(editor, /@\/styles\/markdown-extend\.styl/);
  assert.match(styles, /a\.card-github/);
  assert.match(editor, /enhanceFireflyPreview/);
});

test("cover preview resolves relative paths and handles failed images", async () => {
  const editor = await readFile("src/components/pages/admin/AdminPostManager.svelte", "utf8");
  assert.match(editor, /function previewCoverUrl\(/);
  assert.match(editor, /function retryCover\(/);
  assert.match(editor, /class="article-cover" src=\{previewCoverUrl\(\)\}/);
  assert.match(editor, /onerror=\{retryCover\}/);
});

test("near preview offers split rendering with bidirectional proportional scroll", async () => {
  const editor = await readFile("src/components/pages/admin/AdminPostManager.svelte", "utf8");
  assert.match(editor, /dockedPreview/);
  assert.match(editor, /syncDockedScroll\(from:/);
  assert.match(editor, /origin\.scrollTop\s*\/\s*maxOrigin\s*\*\s*maxTarget/);
  assert.match(editor, /syncDockedScroll\("source"\)/);
  assert.match(editor, /syncDockedScroll\("preview"\)/);
  assert.match(editor, /贴近模式/);
  assert.match(editor, /class:docked=\{dockedPreview\}/);
});
