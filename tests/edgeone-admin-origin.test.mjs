import test from "node:test";
import assert from "node:assert/strict";
import { createPatSessionController } from "../src/server/admin-auth/pat-session.js";
import { createLiveContentService } from "../src/server/live-content/service.js";
import { proxyGalleryManagement } from "../src/server/admin-auth/gallery-proxy.js";

const origin="https://blog.casto.top";
const gateway="https://edgeone-internal.example";
test("EdgeOne PAT handler recognizes canonical browser origin despite gateway rewrite",async()=>{
 const controller=createPatSessionController({sessions:{
  async verifySession(){return null;},
 }});
 const make=(source,site)=>new Request(gateway+"/api/admin/auth/pat-login",{
  method:"POST",
  headers:{"Origin":source,"Sec-Fetch-Site":site,"Content-Type":"application/json"},
  body:JSON.stringify({token:"invalid"}),
 });
 const accepted=await controller.login(make(origin,"same-origin"));
 assert.equal(accepted.status,400);
 assert.equal((await accepted.json()).error,"Invalid GitHub token");
 assert.equal((await controller.login(make("https://untrusted.example","cross-site"))).status,403);
 assert.equal((await controller.login(make(origin,"cross-site"))).status,403);
});
test("EdgeOne live content health accepts production origin while rejecting unrelated origins",async()=>{
 const handler=createLiveContentService({
  store:{},provider:"edgeone",storeName:"temporary",
  trustedBrowserOrigin:origin,
 });
 const allowed=await handler(new Request(gateway+"/api/live-content/health",{
  headers:{"Origin":origin,"Sec-Fetch-Site":"same-origin"},
 }));
 assert.equal(allowed.status,200);
 const rejected=await handler(new Request(gateway+"/api/live-content/health",{
  headers:{"Origin":"https://untrusted.example","Sec-Fetch-Site":"cross-site"},
 }));
 assert.equal(rejected.status,403);
});
test("Gallery same-origin management reaches service-secret check but remains unavailable without it",async()=>{
 const path=gateway+"/api/admin/imagebed/upload";
 const req=(source)=>new Request(path,{method:"POST",headers:{"Origin":source}});
 const accepted=await proxyGalleryManagement(req(origin),{env:{}});
 assert.equal(accepted.status,503);
 const denied=await proxyGalleryManagement(req("https://untrusted.example"),{env:{}});
 assert.equal(denied.status,403);
});
