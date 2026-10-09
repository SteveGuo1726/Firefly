import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePostDocument, buildPostDocument, parseDynamicDocument, buildDynamicDocument } from "../src/utils/admin/content-format.ts";

test("post editor preserves custom YAML, comments, block scalars and exact body on no-op", () => {
 const source = '---\ntitle: "Old" # editor should not erase unrelated data\ndescription: |\n  line 1\n  line 2\ncustom:\n  nested: [1, 2]\n# personal metadata\ntags:\n  - first\n---\n\nOriginal text  \n\n';
 const {fields, body} = parsePostDocument(source);
 assert.equal(buildPostDocument(fields, body, source), source);
 fields.title = "New";
 const changed = buildPostDocument(fields, body, source);
 assert.match(changed, /title: "New"/);
 assert.match(changed, /description: \|\n  line 1\n  line 2/);
 assert.match(changed, /custom:\n  nested: \[1, 2\]/);
 assert.match(changed, /# personal metadata/);
 assert.ok(changed.endsWith("\n\nOriginal text  \n\n"));
});
test("dynamic editor leaves untouched extra fields intact", () => {
 const source = "---\npublished: 2026-10-09\npinned: false\ncustom: |\n  special: yes\n---\n\nhello\n";
 const { fields, body } = parseDynamicDocument(source);
 fields.pinned = true;
 const changed = buildDynamicDocument(fields, body, source);
 assert.match(changed, /pinned: true/);
 assert.match(changed, /custom: \|\n  special: yes/);
});

test("frontmatter delimiter must occupy its own line", () => {
 const source = '---\ntitle: "Hello"\ndescription: "contains --- inside text"\n---\n\nBefore --- inline text\n';
 const parsed = parsePostDocument(source);
 assert.equal(parsed.fields.title, "Hello");
 assert.equal(buildPostDocument(parsed.fields, parsed.body, source), source);
});
test("changing only body preserves YAML and comments exactly", () => {
 const source = '---\ntitle: "A"\ncustom: >-\n  first\n  second\n# extra comment\n---\n\nOld body\n';
 const {fields} = parsePostDocument(source);
 const edited = buildPostDocument(fields,"New body",source);
 assert.match(edited,/custom: >-\n  first\n  second\n# extra comment/);
 assert.match(edited,/New body$/);
});
