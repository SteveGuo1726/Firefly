import assert from "node:assert/strict";
import test from "node:test";
import {proxyGalleryManagement} from "../src/server/admin-auth/gallery-proxy.js";

const env={
 FIREFLY_OAUTH_CLIENT_ID:"configured",
 FIREFLY_OAUTH_CLIENT_SECRET:"server-only",
 FIREFLY_OAUTH_CALLBACK_URL:"https://blog.example.com/api/admin/auth/callback",
 FIREFLY_GALLERY_SERVICE_SECRET:"A".repeat(40),
 FIREFLY_GALLERY_API_ORIGIN:"https://gallery-api.example.com",
};
function store(){
 const data=new Map();
 return {
  async get(key){return data.get(key)??null;},
  async setJSON(key,value,opts){if(opts?.onlyIfNew&&data.has(key))throw Error("duplicate");data.set(key,value);},
  async delete(key){data.delete(key);},
 };
}
const base="https://blog.example.com/api/admin/imagebed/list";
test("gallery management proxy requires allowed route, configured secrets and valid cookie",async()=>{
 const fetcher=async()=>{throw new Error("must not forward");};
 const opts={env,fetcher,storeFactory:store};
 assert.equal((await proxyGalleryManagement(new Request(base),opts)).status,401);
 assert.equal((await proxyGalleryManagement(new Request("https://blog.example.com/api/admin/imagebed/not-real"),opts)).status,404);
 assert.equal((await proxyGalleryManagement(new Request(base),{...opts,env:{...env,FIREFLY_GALLERY_SERVICE_SECRET:""}})).status,503);
 assert.equal((await proxyGalleryManagement(new Request(base,{method:"POST"}),opts)).status,403);
});
test("gallery proxy rejects cross-origin mutation even when browser has cookies",async()=>{
 const response=await proxyGalleryManagement(new Request("https://blog.example.com/api/admin/gallery/manifest",{
  method:"PUT",headers:{Origin:"https://evil.example.com"},
  body:"{}",duplex:"half",
 }),{env,storeFactory:store});
 assert.equal(response.status,403);
});
test("gallery proxy never forwards browser authorization, cookies, or arbitrary destinations",async()=>{
 const blob=store();
 // A test-only opaque server session record; hashed cookie key is computed
 // with the same algorithm used by the live session service.
 const {sha256Base64Url}=await import("../src/server/admin-auth/oauth-core.js");
 const token="A".repeat(64);

 let seen;
 await blob.setJSON("oauth-session:"+await sha256Base64Url(token),{login:"SteveGuo1726",userId:1,expiresAt:Date.now()+100000});
 const response=await proxyGalleryManagement(new Request(base+"?dir=blog",{
  headers:{Cookie:"__Host-firefly-admin="+token,Authorization:"Bearer leaked-browser-token"},
 }),{
  env,storeFactory:()=>blob,
  fetcher:async(url,options)=>{
   seen={url,options};
   return new Response(JSON.stringify({files:[]}),{
    status:200,headers:{"Content-Type":"application/json","Set-Cookie":"exposed=1"},
   });
  },
 });
 assert.equal(response.status,200);
 assert.equal(seen.url,"https://gallery-api.example.com/api/admin/imagebed/list?dir=blog");
 assert.equal(seen.options.headers.get("X-Firefly-Service-Key"),env.FIREFLY_GALLERY_SERVICE_SECRET);
 assert.equal(seen.options.headers.get("Authorization"),null);
 assert.equal(seen.options.headers.get("Cookie"),null);
 assert.equal(response.headers.get("Set-Cookie"),null);
});
