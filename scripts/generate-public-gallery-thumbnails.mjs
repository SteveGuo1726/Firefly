/**
 * Generate independent thumbnails from already-public gallery URLs.
 * Original image bytes are never changed or uploaded.
 * Run: node scripts/generate-public-gallery-thumbnails.mjs
 */
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdir,rm,stat} from "node:fs/promises";
import sharp from "sharp";
const execFileAsync=promisify(execFile);
const PUBLIC_API="https://firefly-gallery-api-preview.guojunyang666666.workers.dev/api/gallery/public";
const ROOT="public/gallery-thumbs";
const MANIFEST="src/data/gallery-thumbnails.json";
const MAX_PHOTOS=150;
const MAX_SIZE_BYTES=14_000_000;
export function safePublicGalleryUrl(value){
 try{
  const url=new URL(value);
  if(url.origin!=="https://img.casto.top" || url.search || url.hash ||
    !url.pathname.startsWith("/file/photos/") ||
    /%2f|%5c|%00/i.test(url.pathname) || url.pathname.includes("..") ||
    !/\.(?:jpe?g|png|webp)$/i.test(url.pathname))return null;
  return url.href;
 }catch{return null;}
}
export function thumbnailFilename(url){
 return createHash("sha256").update(url).digest("hex").slice(0,24)+".webp";
}
async function main(){
 let rawList;
 if(process.env.FIREFLY_GALLERY_PUBLIC_LIST) {
  rawList=await readFile(process.env.FIREFLY_GALLERY_PUBLIC_LIST,"utf8");
 }else{
  const {stdout}=await execFileAsync("curl",[
   "--fail","--silent","--show-error","--location","--max-time","19",
   "--header","Origin: https://firefly-blog-preview.guojunyang666666.workers.dev",
   PUBLIC_API,
  ],{timeout:24000,maxBuffer:3_000_000});
  rawList=stdout;
 }
 const data=JSON.parse(rawList);
 if(!Array.isArray(data.albums))throw Error("Public albums JSON missing");
 const urls=[...new Set(data.albums.flatMap(a=>[
  ...(a.photos||[]).map(p=>p.url),
  a.coverUrl
 ]).filter(Boolean).map(safePublicGalleryUrl).filter(Boolean))];
 if(urls.length>MAX_PHOTOS)throw Error("Refusing over-limit thumbnail generation");
 await mkdir(ROOT,{recursive:true});
 await mkdir("src/data",{recursive:true});
 const previous=JSON.parse(await readFile(MANIFEST,"utf8").catch(()=>'{"schema":1,"images":{}}'));
 const images={};
 let failed=0,success=0,bytes=0;
 const processOne=async(url)=>{
  const filename=thumbnailFilename(url),output=ROOT+"/"+filename;
  const raw=".git/image-thumb-source-"+filename;
  try{
   const prior=await stat(output).catch(()=>null);
   if(prior?.size>0 && previous.images[url]==="/gallery-thumbs/"+filename) {
    images[url]="/gallery-thumbs/"+filename;
    success++;bytes+=prior.size;return;
   }
   const mirror="https://img-route-preview.casto.top"+new URL(url).pathname;
   let fetched=false;
   // The independent read-only CF route can reach the original even when
   // a foreign cloud IP cannot; originals are still NEVER overwritten.
   for(const endpoint of [mirror,url]){
    try{
     await execFileAsync("curl",["--fail","--silent","--show-error","--location","--max-time","21",
      "--max-filesize",String(MAX_SIZE_BYTES),"--output",raw,endpoint],{timeout:25000});
     fetched=true;break;
    }catch{await rm(raw,{force:true}).catch(()=>{});}
   }
   if(!fetched)throw Error("Both public read-only delivery paths failed");
   const input=await readFile(raw);
   if(input.length>MAX_SIZE_BYTES)throw Error("source exceeds max size");
   const metadata=await sharp(input,{failOn:"error",limitInputPixels:100_000_000}).metadata();
   if(!["png","jpeg","webp"].includes(metadata.format))throw Error("unsupported source image");
   const resized=await sharp(input,{failOn:"error",limitInputPixels:100_000_000})
    .rotate().resize({width:480,height:480,fit:"inside",withoutEnlargement:true})
    .webp({quality:75,effort:4}).toBuffer();
   await writeFile(output,resized);
   images[url]="/gallery-thumbs/"+filename;
   success++;bytes+=resized.length;
   console.log("OK",success,filename,input.length+" -> "+resized.length,url);
  }catch(err){
   failed++;
   console.log("SKIP",String(err.message||err).slice(0,120),url);
  }finally{await rm(raw,{force:true}).catch(()=>{});}
 };
 await Promise.all(Array.from({length:4},async(_,idx)=>{
  for(let i=idx;i<urls.length;i+=4)await processOne(urls[i]);
 }));
 const manifest={schema:1,generatedAt:new Date().toISOString(),images:Object.fromEntries(Object.entries(images).sort())};
 await writeFile(MANIFEST,JSON.stringify(manifest,null,2)+"\n");
 console.log(JSON.stringify({urls:urls.length,success,failed,totalThumbBytes:bytes,manifest:MANIFEST}));
 if(!success)process.exitCode=1;
}
if(process.argv[1]?.endsWith("generate-public-gallery-thumbnails.mjs"))await main();
