import assert from "node:assert/strict";
import test from "node:test";
import {insertMarkdownAt,markdownImage} from "../src/utils/admin/editor-image.ts";

test("uploaded image URL becomes safe Markdown, including parentheses",()=>{
 const markdown=markdownImage("a [portrait]","https://img.example.com/file/blog/a%20(1).png");
 assert.ok(markdown.includes("portrait"));
 assert.ok(markdown.includes("portrait"));
 assert.ok(markdown.endsWith(">)"));
});
test("image URL rejects non-http schemes and embedded credentials",()=>{
 assert.throws(()=>markdownImage("bad","javascript:alert(1)"),/HTTP/);
 assert.throws(()=>markdownImage("bad","https://user:pass@img.example.com/a.png"),/HTTP/);
});
test("editor insertion respects selection and returns a valid caret",()=>{
 const value="Before after";
 const res=insertMarkdownAt(value,7,12,"![photo](<https://img.example.com/1.png>)");
 assert.ok(res.value.includes("![photo]"));
 assert.equal(res.caret,res.value.length);
 const beginning=insertMarkdownAt("example",0,0,"![](x)");
 assert.equal(beginning.value,"![](x)\nexample");
});
