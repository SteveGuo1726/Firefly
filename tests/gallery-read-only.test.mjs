import assert from "node:assert/strict";
import test from "node:test";
import galleryWorker from "../worker/index.ts";

test("gallery admin state reads never rewrite manifests after a transient empty photo listing", async () => {
 const key="photos/album/photo.jpg";
 const manifest={
  version:1,updatedAt:"2026-10-09T00:00:00.000Z",
  albums:[{id:"album",sourceDir:"photos/album",name:"Album",description:"",
   category:"",date:"2026-10-09",location:"",tags:[],cover:key,photoOrder:[key]}],
 };
 let writes=0;
 const secret="S".repeat(40);
 const env={
  FIREFLY_ADMIN_SERVICE_SECRET:secret,
  IMAGEBED_TOKEN:"test-only-token",
  IMAGEBED_BASE_URL:"https://imagebed.example",
  GALLERY_MANIFEST:{
   async get(){return manifest;},
   async put(){writes++;},
  },
 };
 const originalFetch=globalThis.fetch;
 const upstream=[];
 globalThis.fetch=async (input,init)=>{
  upstream.push(String(input));
  assert.equal(init?.method ?? "GET","GET");
  return Response.json({files:[],directories:["photos/album"]});
 };
 try{
  const response=await galleryWorker.fetch(new Request("https://gallery-api.example/api/admin/gallery/state",{
   headers:{"X-Firefly-Service-Key":secret},
  }),env);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual(data.manifest.albums[0].photoOrder,[key]);
  assert.equal(data.manifest.albums[0].cover,key);
  assert.equal(data.albums[0].photos.length,0);
  assert.equal(writes,0,"incomplete image-bed list must not rewrite KV");
  assert.equal(upstream.length,1);
 }finally{
  globalThis.fetch=originalFetch;
 }
});
