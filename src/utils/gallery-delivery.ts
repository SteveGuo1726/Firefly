/**
 * Public gallery image selection. The uploaded ORIGINAL bytes never change.
 * Static thumbnails are immutable derivatives; the CF preview route proxies
 * only explicitly public album photos, with fallback to original URL.
 * Never proxy private/unlisted files or arbitrary user supplied origins.
 */
import thumbnailIndex from "@/data/gallery-thumbnails.json";
export type GalleryImageRoute = "auto"|"cloudflare"|"original";
export const GALLERY_ROUTE_STORAGE_KEY = "firefly.gallery.image-route.v1";
export const GALLERY_ROUTE_EVENT = "firefly:gallery-route-changed";
export const GALLERY_CF_PREVIEW_ORIGIN = "https://img-route-preview.casto.top";

const entries: Record<string,string> = thumbnailIndex.images;
const allowed = new Set(Object.keys(entries));
function originPath(original:string):string|null{
 try {
  const url=new URL(original);
  if(url.origin!=="https://img.casto.top" || url.search || url.hash ||
     !url.pathname.startsWith("/file/photos/") || !allowed.has(url.href))return null;
  return url.pathname;
 }catch{return null;}
}
export function galleryThumbnail(original:string):string|null{
 return originPath(original)?entries[original]||null:null;
}
export function cloudflareGalleryImage(original:string):string|null{
 const path=originPath(original);
 return path ? GALLERY_CF_PREVIEW_ORIGIN+path : null;
}
export function galleryGridImage(original:string,route:GalleryImageRoute):string{
 if(route==="original")return original;
 if(route==="cloudflare")return cloudflareGalleryImage(original)||original;
 return galleryThumbnail(original)||cloudflareGalleryImage(original)||original;
}
export function galleryFullImage(original:string,route:GalleryImageRoute):string{
 return route==="original"?original:cloudflareGalleryImage(original)||original;
}
/** Deterministic fallback: static derivative -> CF cached original -> true original. */
export function nextGalleryImageFallback(current:string,original:string,route:GalleryImageRoute):string|null{
 const cf=cloudflareGalleryImage(original);
 const thumb=galleryThumbnail(original);
 const absolute=(value:string)=>{try{return new URL(value,"https://blog.casto.top").href;}catch{return value;}};
 if(route==="auto"&&thumb&&absolute(current)===absolute(thumb))
  return cf||original;
 if(cf&&absolute(current)===absolute(cf)&&route!=="original")
  return original;
 return null;
}
export function parseGalleryRoute(value:unknown):GalleryImageRoute{
 return value==="cloudflare"||value==="original"?value:"auto";
}
export function loadGalleryRoute():GalleryImageRoute{
 try{return parseGalleryRoute(localStorage.getItem(GALLERY_ROUTE_STORAGE_KEY));}
 catch{return "auto";}
}
export function saveGalleryRoute(next:GalleryImageRoute):void{
 try{localStorage.setItem(GALLERY_ROUTE_STORAGE_KEY,next);}catch{}
 if(typeof window!=="undefined")
  window.dispatchEvent(new CustomEvent(GALLERY_ROUTE_EVENT,{detail:next}));
}
