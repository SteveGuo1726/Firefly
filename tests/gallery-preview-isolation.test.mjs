import test from "node:test";
import assert from "node:assert/strict";
import {buildReadOnlyGalleryState} from "../src/server/preview-gallery-bridge.js";

const sample={albums:[{id:"album-1",sourceDir:"photos/album",name:"Album",description:"test",category:"",date:"2026-10-11",location:"",tags:["demo"],cover:"photos/album/a.webp",photoOrder:["photos/album/a.webp"],photos:[{key:"photos/album/a.webp",name:"a.webp",size:43,url:"https://img.casto.top/file/photos/album/a.webp"}]}]};

test("gallery read-only bridge preserves photo keys, URLs, ordering and cover",()=>{
 const state=buildReadOnlyGalleryState(sample);
 assert.equal(state.readOnly,true);
 assert.equal(state.source,"public-gallery-bridge");
 assert.equal(state.albums[0].photos[0].url,sample.albums[0].photos[0].url);
 assert.deepEqual(state.manifest.albums[0].photoOrder,["photos/album/a.webp"]);
 assert.equal(state.manifest.albums[0].cover,"photos/album/a.webp");
 assert.deepEqual(state.unmappedDirectories,[]);
});
test("gallery projection refuses invalid paths, dangerous URLs and duplicate IDs",()=>{
 for(const bad of [
  {...sample,albums:[{...sample.albums[0],id:"../../bad"}]},
  {...sample,albums:[sample.albums[0],sample.albums[0]]},
  {...sample,albums:[{...sample.albums[0],sourceDir:"other/album"}]},
  {...sample,albums:[{...sample.albums[0],photos:[{...sample.albums[0].photos[0],url:"javascript:alert(1)"}]}]},
 ])assert.throws(()=>buildReadOnlyGalleryState(bad));
});
test("isolated preview uses a separate same-origin gallery state and disables mutations",async()=>{
 const {readFile}=await import("node:fs/promises");
 const client=await readFile("src/utils/admin/imagebed-client.ts","utf8");
 const manager=await readFile("src/components/pages/gallery/GalleryAdminManager.svelte","utf8");
 const worker=await readFile("worker/blog-preview.ts","utf8");
 assert.match(client,/function preventPreviewImagebedWrite/);
 assert.equal((client.match(/preventPreviewImagebedWrite\(\);/g)||[]).length,6);
 assert.match(worker,/path==="\/api\/admin\/gallery\/state"/);
 assert.match(worker,/authorizePreviewSession\(request,env\)/);
 assert.match(manager,/localDraftKey="firefly\.gallery\.preview\.local-draft\.v1"/);
 assert.match(manager,/previewReadOnly\?\s*false\s*:\s*confirm/);
 assert.match(manager,/disabled=\{uploading \|\| previewReadOnly\}/);
 assert.match(manager,/保存本机草稿/);
});
