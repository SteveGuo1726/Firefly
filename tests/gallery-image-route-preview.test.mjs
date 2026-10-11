import assert from "node:assert/strict";
import test from "node:test";
import {handleImageRoute,safePublicPath} from "../worker/gallery-image-route-preview.mjs";
const HOST="https://img-route-preview.casto.top";
test("only allowlisted public images, never arbitrary files or query sources",()=>{
 assert.equal(safePublicPath(HOST+"/file/photos/castorice/d2.webp"),"/file/photos/castorice/d2.webp");
 for(const x of ["/file/posts/mmdcasto1.png","/file/photos/private/secret.jpg",
  "/api/admin/gallery/state","/file/photos/castorice/../../private.jpg",
  "/file/photos/castorice/%2e%2e/private.jpg",
  "/file/photos/castorice/d2.webp?url=https://evil.test",
  "/file/photos/castorice/d2.webp%2fprivate.png"])assert.equal(safePublicPath(HOST+x),null,x);
});
test("allows GET/HEAD but never uploads/DELETE, or caller-specified origins",async()=>{
 assert.equal((await handleImageRoute(new Request(HOST+"/file/photos/castorice/d2.webp",{method:"POST"}))).status,405);
 let source="";
 const r=await handleImageRoute(new Request(HOST+"/file/photos/castorice/d2.webp"),{},async url=>{
  source=url;return new Response("bytes",{headers:{"Content-Type":"image/webp","Content-Length":"5","Set-Cookie":"secret=x"}});
 },null);
 assert.equal(r.status,200);
 assert.equal(source,"https://img.casto.top/file/photos/castorice/d2.webp");
 assert.equal(r.headers.get("Set-Cookie"),null);
 assert.equal(r.headers.get("Access-Control-Allow-Origin"),"*");
 assert.equal(r.headers.get("X-Firefly-Edge-Cache"),"MISS");
});
test("cached hits never contact original storage",async()=>{
 const r=await handleImageRoute(new Request(HOST+"/file/photos/castorice/d2.webp"),{},async()=>{
  throw Error("must not contact source");
 },{match:async()=>new Response("cached",{headers:{"Content-Type":"image/webp"}})});
 assert.equal(r.status,200);
 assert.equal(r.headers.get("X-Firefly-Edge-Cache"),"HIT");
});
test("image errors and non-images fail closed",async()=>{
 const url=HOST+"/file/photos/castorice/d2.webp";
 const a=await handleImageRoute(new Request(url),{},async()=>new Response('{"secret":"token"}',{headers:{"Content-Type":"application/json"}}),null);
 assert.equal(a.status,502);
 assert.doesNotMatch(await a.text(),/token/);
 const b=await handleImageRoute(new Request(url),{},async()=>{throw Error("secret private");},null);
 assert.equal(b.status,503);
 assert.doesNotMatch(await b.text(),/secret private/);
});
