import assert from "node:assert/strict";
import test from "node:test";
import {galleryThumbnail,cloudflareGalleryImage,galleryGridImage,galleryFullImage,nextGalleryImageFallback,parseGalleryRoute} from "../src/utils/gallery-delivery";
const original="https://img.casto.top/file/photos/castorice/d2.webp";
test("auto gallery grid reads static derivative without modifying its original URL",()=>{
 const thumbnail=galleryThumbnail(original);
 assert.ok(thumbnail?.startsWith("/gallery-thumbs/"));
 assert.ok(thumbnail?.endsWith(".webp"));
 assert.equal(galleryGridImage(original,"auto"),thumbnail);
 assert.equal(galleryGridImage(original,"original"),original);
 assert.equal(galleryFullImage(original,"original"),original);
});
test("CF opt-in uses allowlisted public proxy; manual original does not route",()=>{
 const cf=cloudflareGalleryImage(original);
 assert.equal(cf,"https://img-route-preview.casto.top/file/photos/castorice/d2.webp");
 assert.equal(galleryGridImage(original,"cloudflare"),cf);
 assert.equal(galleryFullImage(original,"auto"),cf);
});
test("never allow private, unknown, or foreign URLs into the image proxy",()=>{
 for(const bad of ["https://evil.example/file/photos/castorice/d2.webp",
  "https://img.casto.top/file/photos/private/unlisted.png",
  "https://img.casto.top/api/admin/gallery/state",
  "https://img.casto.top/file/photos/castorice/d2.webp?secret=x"]){
  assert.equal(cloudflareGalleryImage(bad),null);
  assert.equal(galleryThumbnail(bad),null);
  assert.equal(galleryGridImage(bad,"auto"),bad);
 }
});
test("failed thumbnails switch once to CF and then once to original, no loops",()=>{
 const thumb=galleryThumbnail(original);
 const cf=cloudflareGalleryImage(original);
 assert.equal(nextGalleryImageFallback(thumb!,original,"auto"),cf);
 assert.equal(nextGalleryImageFallback(cf!,original,"auto"),original);
 assert.equal(nextGalleryImageFallback(original,original,"auto"),null);
 assert.equal(nextGalleryImageFallback(cf!,original,"cloudflare"),original);
 assert.equal(nextGalleryImageFallback(original,original,"original"),null);
});
test("invalid stored settings safely default to auto",()=>{
 assert.equal(parseGalleryRoute("??"),"auto");
 assert.equal(parseGalleryRoute("original"),"original");
 assert.equal(parseGalleryRoute("cloudflare"),"cloudflare");
});
