/**
 * Recover immutable, SHA-256-pinned Firefly static pages and assets.
 * The original site's immutable EdgeOne deployment is the authoritative source.
 * Nothing is downloaded from an untrusted moving branch or a development sandbox.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('../recovery/original-public/',import.meta.url)));
// The pinned immutable deployment is authoritative; production is an opt-in
// byte-identical mirror for environments where the old preview now needs auth.
const BASE=process.env.FIREFLY_ORIGINAL_PUBLIC_BASE||'https://blog.casto.top';
const EXPECTED_ROUTES=['gallery','gallery/castorice-2026','gallery/firefly-2026','friends'];
const sha256=b=>createHash('sha256').update(b).digest('hex');
const approved=p=>/^\/(?:_astro\/[A-Za-z0-9_.-]+\.(?:js|css|webp|avif|png|jpe?g)|gallery-thumbs\/[A-Za-z0-9_.-]+\.(?:webp|avif|jpe?g|png))$/.test(p);

async function checkedDownload(url,sha,bytes){
 const response=await fetch(BASE+url,{redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('Immutable Firefly original resource HTTP '+response.status+': '+url);
 const value=Buffer.from(await response.arrayBuffer());
 if(value.length!==bytes || sha256(value)!==sha)throw Error('Original Firefly SHA-256/size mismatch: '+url);
 return value;
}
async function ensureAsset(item){
 if(!approved(item.url))throw Error('Unapproved original asset URL');
 const file=join(root,'assets',item.url.slice(1));
 let value=await readFile(file).catch(()=>null);
 if(value && (value.length!==item.bytes || sha256(value)!==item.sha256))throw Error('Cached original asset corrupted: '+item.url);
 if(!value){
  value=await checkedDownload(item.url,item.sha256,item.bytes);
  await mkdir(dirname(file),{recursive:true});await writeFile(file,value);
 }
 return value;
}
async function ensurePage(item){
 if(!EXPECTED_ROUTES.includes(item.route))throw Error('Unexpected original public route');
 const file=join(root,'pages',item.route+'.html');
 let value=await readFile(file).catch(()=>null);
 if(value && (value.length!==item.bytes || sha256(value)!==item.sha256))throw Error('Cached original page corrupted: '+item.route);
 if(!value){
  value=await checkedDownload('/'+item.route+'/',item.sha256,item.bytes);
  await mkdir(dirname(file),{recursive:true});await writeFile(file,value);
 }
 return value;
}
async function apply(dist){
 const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
 if(manifest.version!==1||manifest.source!=='https://blog.casto.top'||manifest.pages.length!==4||manifest.assets.length<40)throw Error('Unexpected original Firefly manifest');
 for(const item of manifest.assets){
  const value=await ensureAsset(item);
  const dest=join(dist,item.url.slice(1));
  const old=await readFile(dest).catch(()=>null);
  if(old&&!old.equals(value))throw Error('Asset naming collision: '+item.url);
  if(!old){await mkdir(dirname(dest),{recursive:true});await writeFile(dest,value)}
 }
 for(const item of manifest.pages){
  let html=(await ensurePage(item)).toString('utf8');
  if(!html.includes('星遐蝶梦')||!html.includes('<!DOCTYPE html>'))throw Error('Invalid original Firefly HTML '+item.route);
  if(item.route==='friends'){
   // The owner's former SteveGuo1726 GitHub feed is gone. Retain the ORIGINAL client logic and point to EdgeOne's same-schema API.
   html=html.replace(/data-api-urls="[^"]*"/,'data-api-urls="[&quot;/api/friend-circle.json&quot;]"');
   html=html.replace(/data-fallback-api-urls="[^"]*"/,'data-fallback-api-urls="[&quot;/assets/recovered-friend-circle.json&quot;]"');
  }
  const path=join(dist,item.route,'index.html');await mkdir(dirname(path),{recursive:true});await writeFile(path,html);
 }
 console.log('ORIGINAL_PUBLIC_RESTORED pages='+manifest.pages.length+' assets='+manifest.assets.length);
}
if(process.argv[2]==='--apply'&&process.argv[3])await apply(resolve(process.argv[3]));
else throw Error('Usage: node scripts/restore-original-public-pages.mjs --apply dist');
