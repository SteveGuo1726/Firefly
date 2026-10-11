/**
 * Read-only interoperability bridge for the existing public imagebed contract.
 * The image host's independent gallery editor owns ALL mutations and schema
 * migrations. No credentials, upload endpoints or KV writes are needed here.
 */
const maxAlbums=200;
const maxPhotosPerAlbum=2000;
const string=(value,max=500)=>typeof value==='string'?value.slice(0,max):'';
const safePhotoPath=(value)=>/^photos\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)+$/.test(value)&&!value.includes('..');
const safeDirectory=(value)=>/^photos\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(value);
const unique=(items)=>[...new Set(items)];

export function buildReadOnlyGalleryState(publicPayload){
 if(!publicPayload||!Array.isArray(publicPayload.albums)||publicPayload.albums.length>maxAlbums){
  throw new Error('Invalid or oversized public gallery response');
 }
 const albums=[];const ids=new Set();
 for(const item of publicPayload.albums){
  if(!item||typeof item!=='object'||typeof item.id!=='string'||!item.id||!/^[a-z0-9_-]{1,80}$/i.test(item.id)){
   throw new Error('Gallery album ID is invalid');
  }
  if(ids.has(item.id))throw new Error('Duplicate gallery album ID');
  ids.add(item.id);
  if(!safeDirectory(item.sourceDir)||!Array.isArray(item.photos)||item.photos.length>maxPhotosPerAlbum){
   throw new Error('Gallery directory or photo list is invalid');
  }
  const photoKeys=new Set();
  const photos=item.photos.map(photo=>{
   if(!photo||!safePhotoPath(photo.key)||typeof photo.url!=='string')throw new Error('Gallery photo is invalid');
   if(photoKeys.has(photo.key))throw new Error('Duplicate photo key');
   photoKeys.add(photo.key);
   let url;
   try{url=new URL(photo.url)}catch{throw new Error('Invalid gallery photo URL')}
   if(url.protocol!=='https:')throw new Error('Unsafe gallery photo URL');
   return {key:photo.key,url:url.href,name:string(photo.name,255)||photo.key.split('/').at(-1),size:Math.max(0,Number(photo.size)||0),
    ...(Number.isFinite(Number(photo.width))&&Number(photo.width)>0?{width:Number(photo.width)}:{}),
    ...(Number.isFinite(Number(photo.height))&&Number(photo.height)>0?{height:Number(photo.height)}:{})};
  });
  const order=Array.isArray(item.photoOrder)?unique(item.photoOrder.filter(key=>typeof key==='string'&&photoKeys.has(key))):[];
  const album={id:item.id,sourceDir:item.sourceDir,name:string(item.name,180)||item.id,
   description:string(item.description,3000),category:string(item.category,200),date:string(item.date,30),
   location:string(item.location,250),tags:Array.isArray(item.tags)?item.tags.filter(x=>typeof x==='string').slice(0,60).map(x=>string(x,120)):[],
   cover:typeof item.cover==='string'&&photoKeys.has(item.cover)?item.cover:'',photoOrder:order};
  albums.push({...album,photos,photoCount:photos.length,coverUrl:string(item.coverUrl,1500)});
 }
 const manifest={version:1,updatedAt:string(publicPayload.updatedAt,100),albums:albums.map(({photos,photoCount,coverUrl,...meta})=>meta)};
 const directories=unique(albums.map(album=>album.sourceDir));
 return {manifest,albums,directories,unmappedDirectories:[],readOnly:true,source:'public-gallery-bridge'};
}
