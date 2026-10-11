import test from "node:test";
import assert from "node:assert/strict";
import {buildPrivatePostIndex} from "../src/server/admin-auth/private-index.js";
test("private index includes drafts but never exports source bodies",async()=>{
 const source="---\ntitle: Hidden draft\ndraft: true\npublished: 2026-10-10\n---\nSECRET BODY";
 const encoded=btoa(Array.from(new TextEncoder().encode(source),b=>String.fromCharCode(b)).join(""));
 const fetcher=async url=>{
  if(url.includes("/git/trees/"))return new Response(JSON.stringify({tree:[{path:"src/content/posts/draft.md",type:"blob"}]}));
  return new Response(JSON.stringify({content:encoded}));
 };
 const data=await buildPrivatePostIndex({token:"secret",owner:"example",repo:"blog",branch:"preview",fetcher});
 assert.equal(data.posts.length,1);
 assert.equal(data.posts[0].draft,true);
 assert.equal(data.posts[0].title,"Hidden draft");
 assert.equal("source" in data.posts[0],false);
 assert.equal(JSON.stringify(data).includes("SECRET BODY"),false);
});
test("private index fails closed on truncated GitHub tree",async()=>{
 await assert.rejects(()=>buildPrivatePostIndex({token:"secret",owner:"example",repo:"blog",branch:"preview",fetcher:async()=>new Response(JSON.stringify({truncated:true,tree:[]}))}),/truncated/);
});
