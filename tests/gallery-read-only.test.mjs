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


test("gallery rejects stale-tab manifest writes without touching stored data", async () => {
 const secret="S".repeat(40);
 let writes=0;
 const current={version:1,updatedAt:"2026-10-10T09:00:00.000Z",albums:[]};
 const env={FIREFLY_ADMIN_SERVICE_SECRET:secret,
  GALLERY_MANIFEST:{async get(){return current;},async put(){writes++;}},
 };
 const outdated={version:1,updatedAt:"2026-10-09T09:00:00.000Z",albums:[]};
 const response=await galleryWorker.fetch(new Request("https://gallery-api.example/api/admin/gallery/manifest",{
  method:"PUT",headers:{"X-Firefly-Service-Key":secret,"Content-Type":"application/json"},
  body:JSON.stringify(outdated),
 }),env);
 assert.equal(response.status,409);
 assert.equal(writes,0);
});


test("gallery directory rename rolls back earlier files after a later rename fails", async () => {
 const secret="S".repeat(40);
 const env={FIREFLY_ADMIN_SERVICE_SECRET:secret,IMAGEBED_TOKEN:"test",IMAGEBED_BASE_URL:"https://imagebed.example"};
 const originalFetch=globalThis.fetch;
 const renameCalls=[];
 globalThis.fetch=async (input,init)=>{
  const url=String(input);
  if(url.includes("/api/manage/list?")) {
   const dir=new URL(url).searchParams.get("dir");
   return Response.json(dir==="photos/target"?{files:[]}:
    {files:[{name:"photos/source/a.jpg"},{name:"photos/source/b.jpg"}]});
  }
  if(url.includes("/api/manage/rename/")) {
   const key=decodeURIComponent(url.split("/api/manage/rename/")[1]);
   const destination=JSON.parse(init.body).newFileId;
   renameCalls.push([key,destination]);
   if(key==="photos/source/b.jpg") return Response.json({message:"simulated failure"},{status:500});
   return Response.json({newFileId:destination});
  }
  throw new Error("unexpected "+url);
 };
 try{
  const response=await galleryWorker.fetch(new Request("https://gallery-api.example/api/admin/gallery/rename-album",{
   method:"POST",headers:{"X-Firefly-Service-Key":secret,"Content-Type":"application/json"},
   body:JSON.stringify({sourceDir:"photos/source",newSourceDir:"photos/target"}),
  }),env);
  assert.equal(response.status,502);
  assert.deepEqual(renameCalls,[
   ["photos/source/a.jpg","photos/target/a.jpg"],
   ["photos/source/b.jpg","photos/target/b.jpg"],
   ["photos/target/a.jpg","photos/source/a.jpg"],
  ]);
 }finally{globalThis.fetch=originalFetch;}
});

test("public gallery allows cross-origin reads but never opens admin CORS", async () => {
 const album={id:"album",sourceDir:"photos/album",name:"Public album",photoOrder:[],cover:""};
 const env={
  ALLOWED_ORIGIN:"https://firefly-blog-preview.guojunyang666666.workers.dev",
  GALLERY_MANIFEST:{async get(){return {version:1,updatedAt:"2026-10-10T00:00:00.000Z",albums:[album]};}},
 };
 const origin="https://sb-6kuax07bfhra.vercel.run";
 const publicRequest=new Request("https://gallery.example/api/gallery/public?summary=true",{headers:{Origin:origin}});
 const publicResponse=await galleryWorker.fetch(publicRequest,env);
 assert.equal(publicResponse.status,200);
 assert.equal(publicResponse.headers.get("Access-Control-Allow-Origin"),"*");
 const payload=await publicResponse.json();
 assert.ok(Array.isArray(payload.albums));
 const preflight=await galleryWorker.fetch(new Request("https://gallery.example/api/gallery/public",{
  method:"OPTIONS",headers:{Origin:origin},
 }),env);
 assert.equal(preflight.status,204);
 assert.equal(preflight.headers.get("Access-Control-Allow-Origin"),"*");
 const blocked=await galleryWorker.fetch(new Request("https://gallery.example/api/admin/gallery/state",{
  headers:{Origin:origin},
 }),env);
 assert.equal(blocked.status,403);
 assert.equal(blocked.headers.get("Access-Control-Allow-Origin"),null);
});

test("public gallery errors do not reveal storage exception secrets",async()=>{
 const env={
  GALLERY_MANIFEST:{async get(){throw new Error("PRIVATE_KV_KEY_MUST_NOT_LEAK");}},
 };
 const res=await galleryWorker.fetch(new Request("https://gallery.example/api/gallery/public"),env);
 assert.ok([200,503].includes(res.status));
 const text=await res.text();
 assert.doesNotMatch(text,/PRIVATE_KV_KEY_MUST_NOT_LEAK/);
});
