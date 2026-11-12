/** Firefly album metadata on EdgeOne. No remote image mutation is performed. */
import {randomUUID} from 'node:crypto';
const MANIFEST_KEY='firefly/gallery/manifest/v1.json';
const ID=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/;
export class GalleryError extends Error {constructor(status,message){super(message);this.status=status;}}
const isProtected=a=>!!(a.password||a.passwordHash||a.encrypted||a.private||a.protected);
const fileUrl=key=>`/file/${key.split('/').map(encodeURIComponent).join('/')}`;

export function validateManifest(manifest) {
 if(!manifest||typeof manifest!=='object'||!Array.isArray(manifest.albums)||manifest.albums.length>200)throw new GalleryError(400,'Invalid gallery manifest');
 if(JSON.stringify(manifest).length>1_000_000)throw new GalleryError(413,'Gallery manifest too large');
 const seen=new Set(), names=new Set();let photos=0;
 for(const a of manifest.albums){
  if(!a||typeof a.id!=='string'||!ID.test(a.id)||seen.has(a.id))throw new GalleryError(400,'Invalid or duplicate gallery album ID');
  seen.add(a.id);
  if(typeof a.name!=='string'||!a.name.trim()||a.name.length>250)throw new GalleryError(400,'Invalid album name');
  for(const v of ['name','description','cover','sourceDir','date','location','category'])if(a[v]!==undefined&&typeof a[v]!=='string')throw new GalleryError(400,'Invalid album text field');
  if(!Array.isArray(a.photoOrder)||a.photoOrder.length>5000||!a.photoOrder.every(x=>typeof x==='string'&&x.length<2048&&!x.includes('..')&&!x.includes('\\')))throw new GalleryError(400,'Invalid photo list');
  if(a.tags!==undefined&&(!Array.isArray(a.tags)||a.tags.length>200||a.tags.some(x=>typeof x!=='string'||x.length>100)))throw new GalleryError(400,'Invalid album tags');
  photos+=a.photoOrder.length;
 }
 return {albums:seen.size,photos};
}
export function publicGalleryManifest(manifest){
 if(!manifest||!Array.isArray(manifest.albums))return {albums:[]};
 return {version:manifest.version,albums:manifest.albums.map(a=>{
  const encrypted=isProtected(a);
  const clean={id:a.id,name:a.name,description:a.description||'',date:a.date||'',tags:Array.isArray(a.tags)?a.tags:[],location:a.location||'',encrypted,imageCount:a.photoOrder?.length||0};
  if(encrypted)return clean;
  const keys=Array.isArray(a.photoOrder)?a.photoOrder:[];
  const cover=typeof a.cover==='string'&&a.cover?a.cover:(keys[0]||'');
  return {...clean,cover,coverUrl:cover?fileUrl(cover):'',photoOrder:keys,
   photos:keys.map(key=>({key,url:fileUrl(key),name:key.split('/').at(-1)})),photoCount:keys.length};
 })};
}
export function createGalleryIndex(store,{enableWrites=false,clock=()=>new Date()}={}){
 return {
  async get(){return store.getJSON(MANIFEST_KEY)},
  async save(manifest,{expectedRevision=null}={}){
   if(!enableWrites)throw new GalleryError(503,'Gallery writes disabled until safe single-writer mode is configured');
   validateManifest(manifest);
   const old=await store.getJSON(MANIFEST_KEY),rev=old?.revision||null;
   if(rev!==expectedRevision)throw new GalleryError(409,'Gallery revision conflict; reload before saving');
   const next={...structuredClone(manifest),revision:randomUUID(),updatedAt:clock().toISOString()};
   // Persistent snapshot first; pointer last. External CAS is NOT provided by Blob.
   await store.setJSON(`firefly/gallery/revisions/${next.revision}.json`,next);
   await store.setJSON(MANIFEST_KEY,next);
   return next;
  },
  async importManifest(manifest){
   if(!enableWrites)throw new GalleryError(503,'Gallery migration disabled');
   validateManifest(manifest);
   if(await store.getJSON(MANIFEST_KEY))throw new GalleryError(409,'Refusing to replace existing gallery');
   // Preserve imported historic bytes/fields; do not rewrite provenance on import.
   await store.setJSON(MANIFEST_KEY,manifest);
   return validateManifest(manifest);
  },
  manifestKey:MANIFEST_KEY,
 }
}
