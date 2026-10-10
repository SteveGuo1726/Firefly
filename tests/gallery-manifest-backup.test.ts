import assert from "node:assert/strict";
import {test} from "node:test";
import {
 inspectGalleryManifest,createGalleryManifestBackup,
} from "../src/utils/admin/gallery-manifest-backup";
import type {GalleryManifest,GalleryAdminState} from "../src/types/galleryAdmin";

const oneAlbum=():GalleryManifest=>({
 version:1,updatedAt:"2026-10-10T00:00:00.000Z",
 albums:[{
  id:"album",sourceDir:"photos/album",name:"Album",description:"",photoOrder:["photos/album/a.jpg"],
  cover:"photos/album/a.jpg",
 }],
});
test("manifest health reports a valid metadata backup",async()=>{
 const manifest=oneAlbum();
 const report=inspectGalleryManifest(manifest);
 assert.equal(report.errorCount,0);
 assert.equal(report.warningCount,0);
 const result=await createGalleryManifestBackup(manifest);
 assert.equal(result.sha256.length,64);
 assert.deepEqual(JSON.parse(result.json).manifest,manifest);
 assert.equal(result.report.albumCount,1);
});
test("manifest health detects duplicated IDs/directories and path escapes",()=>{
 const manifest=oneAlbum();
 manifest.albums.push({...manifest.albums[0],name:"another"});
 manifest.albums[0].photoOrder.push("photos/outside/secret.jpg","photos/album/a.jpg");
 manifest.albums[0].cover="photos/outside/secret.jpg";
 manifest.albums[1].sourceDir="photos/../secret";
 const report=inspectGalleryManifest(manifest);
 for (const code of ["duplicate-id","invalid-directory","outside-photo","outside-cover","duplicate-photo"]) {
  assert.ok(report.issues.some(issue=>issue.code===code),code);
 }
});
test("manifest reports remote drift without deleting any local order",()=>{
 const manifest=oneAlbum();
 const state:GalleryAdminState={
  manifest,directories:[],unmappedDirectories:[],
  albums:[{...manifest.albums[0],photoCount:2,coverUrl:"",
   photos:[
    {key:"photos/album/a.jpg",url:"https://example.test/a",name:"a",size:1},
    {key:"photos/album/b.jpg",url:"https://example.test/b",name:"b",size:1},
   ]}],
 };
 const snapshot=JSON.stringify(manifest);
 const report=inspectGalleryManifest(manifest,state);
 assert.ok(report.issues.some(issue=>issue.code==="unlisted-photos"));
 assert.equal(JSON.stringify(manifest),snapshot);
});
test("backup checksum changes with pending local manifest edits",async()=>{
 const old=oneAlbum(),modified=oneAlbum();
 modified.albums[0].name="Edited offline";
 const [a,b]=await Promise.all([createGalleryManifestBackup(old),createGalleryManifestBackup(modified)]);
 assert.notEqual(a.sha256,b.sha256);
 assert.equal(a.report.errorCount,0);
});
