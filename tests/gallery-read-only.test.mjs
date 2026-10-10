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


test("gallery admin refuses directory deletes and non-image renames", async () => {
 const secret="S".repeat(40);
 const env={FIREFLY_ADMIN_SERVICE_SECRET:secret};
 for (const [path,body] of [
  ["/api/admin/imagebed/delete",{key:"photos"}],
  ["/api/admin/imagebed/delete",{key:"blog"}],
  ["/api/admin/imagebed/delete",{key:"photos/.firefly-gallery/backup.json"}],
  ["/api/admin/imagebed/rename",{key:"photos/album/picture.jpg",newKey:"photos/album/picture.json"}],
  ["/api/admin/gallery/rename-album",{sourceDir:"photos/album",newSourceDir:"photos/album"}],
 ]) {
  const response=await galleryWorker.fetch(new Request("https://gallery-api.example"+path,{
   method:"POST",headers:{"X-Firefly-Service-Key":secret,"Content-Type":"application/json"},
   body:JSON.stringify(body),
  }),env);
  assert.equal(response.status,400,path);
 }
});

test("gallery rename refuses to overwrite a non-empty target directory", async () => {
 const secret="S".repeat(40);
 const env={FIREFLY_ADMIN_SERVICE_SECRET:secret,IMAGEBED_TOKEN:"test",IMAGEBED_BASE_URL:"https://imagebed.example"};
 const originalFetch=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async (input)=>{
  calls.push(String(input));
  return Response.json({files:[{name:"photos/target/existing.jpg"}]});
 };
 try{
  const response=await galleryWorker.fetch(new Request("https://gallery-api.example/api/admin/gallery/rename-album",{
   method:"POST",headers:{"X-Firefly-Service-Key":secret,"Content-Type":"application/json"},
   body:JSON.stringify({sourceDir:"photos/source",newSourceDir:"photos/target"}),
  }),env);
  assert.equal(response.status,409);
  assert.equal(calls.length,1,"should check only destination without moving any file");
 }finally{
  globalThis.fetch=originalFetch;
 }
});
