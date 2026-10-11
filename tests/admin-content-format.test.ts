import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePostDocument, buildPostDocument, parseDynamicDocument, buildDynamicDocument } from "../src/utils/admin/content-format.ts";

test("post editor preserves custom YAML, comments, block scalars and exact body on no-op", () => {
 const source = '---\ntitle: "Old" # editor should not erase unrelated data\ndescription: |\n  line 1\n  line 2\ncustom:\n  nested: [1, 2]\n# personal metadata\ntags:\n  - first\n---\n\nOriginal text  \n\n';
 const {fields, body} = parsePostDocument(source);
 assert.equal(fields.title, "Old");
 assert.equal(fields.description, "line 1\nline 2");
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

test("CRLF frontmatter retains original line endings when editing title", () => {
 const source = "---\r\ntitle: 'Before'\r\nextra:\r\n  nested: true\r\n---\r\n\r\nHello\r\n";
 const {fields,body} = parsePostDocument(source);
 assert.equal(buildPostDocument(fields,body,source),source);
 fields.title="After";
 const changed=buildPostDocument(fields,body,source);
 assert.match(changed,/title: "After"\r\nextra:\r\n  nested: true\r\n/);
 assert.ok(changed.endsWith("\r\n\r\nHello\r\n"));
});

test("frontmatter parser ignores indented and inline separators", () => {
 const original = '---\ntitle: "Keep"\ndescription: "valid"\ncustom: |\n  ---\n  content\n---\n\nbody\n';
 const {fields,body} = parsePostDocument(original);
 assert.equal(fields.title,"Keep");
 assert.equal(fields.description,"valid");
 assert.equal(buildPostDocument(fields,body,original),original);
 fields.title="Changed";
 const result=buildPostDocument(fields,body,original);
 assert.match(result,/custom: \|\n  ---\n  content/);
});
test("comments on known scalar fields do not get included in values", () => {
 const original="---\ntitle: 'It''s mine' # title comment\ndraft: true # draft comment\n---\n\nText";
 const {fields,body}=parsePostDocument(original);
 assert.equal(fields.title,"It's mine");
 assert.equal(fields.draft,true);
 assert.equal(buildPostDocument(fields,body,original),original);
 fields.draft=false;
 const updated=buildPostDocument(fields,body,original);
 assert.match(updated,/title: 'It''s mine' # title comment/);
 assert.match(updated,/draft: false/);
});
