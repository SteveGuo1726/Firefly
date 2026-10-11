import test from "node:test";
import assert from "node:assert/strict";
import {handleProbe} from "../worker/china-route-probe-preview.mjs";
const host="https://firefly-cn-route-probe-preview.example.workers.dev";
test("dashboard is self-hosted and private-data free",async()=>{
 const r=await handleProbe(new Request(host+"/"));
 assert.equal(r.status,200);
 const html=await r.text();
 assert.match(html,/中国大陆访客|国内访问线路实验/);
 assert.doesNotMatch(html,/analytics\.|https:\/\/api\.|password|authorization:|tracking/i);
 assert.equal(r.headers.get("Cache-Control"),"no-store");
});
test("worker refuses mutations and unknown paths",async()=>{
 assert.equal((await handleProbe(new Request(host+"/sample.png",{method:"POST"}))).status,405);
 assert.equal((await handleProbe(new Request(host+"/etc/passwd"))).status,404);
 assert.equal((await handleProbe(new Request(host+"/health"))).status,200);
});
test("only the approved original is fetched; query cannot redirect target",async()=>{
 let count=0,actual="";
 const fetcher=async(url,opts)=>{count++;actual=url;assert.equal(opts.cf.cacheTtl,7200);
  return new Response(new Uint8Array([137,80,78,71]),{headers:{"Content-Type":"image/png"}});
 };
 const response=await handleProbe(new Request(host+"/sample.png?url=https://evil.example/something&v=111"),{},fetcher,null);
 assert.equal(response.status,200);
 assert.equal(count,1);
 assert.equal(actual,"https://img.casto.top/file/posts/mmdcasto1.png");
 assert.equal(response.headers.get("Access-Control-Allow-Origin"),"*");
 assert.equal(response.headers.get("X-Firefly-Edge-Cache"),"MISS");
});
test("cache hits avoid requesting source",async()=>{
 const response=await handleProbe(new Request(host+"/sample.png"),{},async()=>{throw Error("fetch should not run");},{
  match:async()=>new Response("cached-binary",{headers:{"Content-Type":"image/png"}})
 });
 assert.equal(response.status,200);
 assert.equal(response.headers.get("X-Firefly-Edge-Cache"),"HIT");
});
test("never caches failures or sets cookies, fails closed on origin errors",async()=>{
 const r=await handleProbe(new Request(host+"/sample.png"),{},async()=>new Response("denied",{status:403}),null);
 assert.equal(r.status,502);
 assert.equal(r.headers.get("Cache-Control"),"no-store");
 const e=await handleProbe(new Request(host+"/sample.png"),{},async()=>{throw Error("secret-token");},null);
 assert.equal(e.status,503);
 assert.doesNotMatch(await e.text(),/secret-token/);
});

test("prebuilt derivative is real WebP and never refetches the original",async()=>{
 const r=await handleProbe(new Request(host+"/sample-480.webp?client_probe=123"),{},
  async()=>{throw Error("must not request original for prebuilt thumbnail");},null);
 assert.equal(r.status,200);
 assert.equal(r.headers.get("Content-Type"),"image/webp");
 assert.equal(r.headers.get("X-Firefly-Derivative"),"480-webp-prebuilt");
 const bytes=new Uint8Array(await r.arrayBuffer());
 assert.equal(bytes.length,14504);
 assert.equal(new TextDecoder().decode(bytes.subarray(0,4)),"RIFF");
 assert.equal(new TextDecoder().decode(bytes.subarray(8,12)),"WEBP");
});
