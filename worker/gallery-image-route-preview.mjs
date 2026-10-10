/**
 * Read-only experimental image delivery for the publicly listed Firefly
 * gallery photos. No private images, uploads, arbitrary URLs or credentials.
 * This is a bounded Worker-free-tier experiment, not unlimited public CDN.
 */
const PUBLIC_PATHS=new Set(["/file/photos/castorice/d1.webp","/file/photos/castorice/d2.webp","/file/photos/castorice/d3.webp","/file/photos/castorice/d4.webp","/file/photos/castorice/m1.webp","/file/photos/castorice/m2.webp","/file/photos/castorice/m4.webp","/file/photos/test/1750521068016.jpg","/file/photos/test/1751328966507.jpg","/file/photos/test/1751723204251.webp","/file/photos/test/1758430420145.png","/file/photos/test/1762689391165.jpeg","/file/photos/test/1782174530943.jpeg","/file/photos/test/1783175257280.jpeg","/file/photos/test/1784453238201.jpeg","/file/photos/test/ENDFIELD_SHARE_1784526812.png","/file/photos/test/ENDFIELD_SHARE_1784527037.png","/file/photos/wei-wei-an/wwa1.png","/file/photos/wei-wei-an/wwa2.png","/file/photos/wei-wei-an/wwa3.png","/file/photos/wei-wei-an/wwa4.png","/file/photos/wei-wei-an/wwa5.png"]);
const SOURCE="https://img.casto.top";
const CACHE_TTL_SECONDS=1800;
const MAX_CONTENT_LENGTH=14_000_000;
const BASE_HEADERS={
 "Access-Control-Allow-Origin":"*",
 "Timing-Allow-Origin":"*",
 "X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer",
 "X-Robots-Tag":"noindex, nofollow",
};
export function safePublicPath(raw){
 try{
  const u=new URL(raw);
  if(u.username||u.password||u.hash||u.search||
     /%2f|%5c|%00/i.test(u.pathname)||u.pathname.length>400)return null;
  return PUBLIC_PATHS.has(u.pathname)?u.pathname:null;
 }catch{return null;}
}
function plain(status,message){
 return new Response(message,{status,headers:{"Cache-Control":"no-store",...BASE_HEADERS}});
}
function imageHeaders(input,cacheState){
 const h=new Headers(input);
 h.delete("set-cookie");h.delete("content-encoding");h.delete("content-length");
 h.set("Cache-Control","public, max-age=900, s-maxage="+CACHE_TTL_SECONDS);
 h.set("X-Firefly-Image-Route","cf-preview");
 h.set("X-Firefly-Edge-Cache",cacheState);
 for(const [k,v] of Object.entries(BASE_HEADERS))h.set(k,v);
 return h;
}
export async function handleImageRoute(request,ctx={},fetcher=fetch,cache=globalThis.caches?.default){
 const u=new URL(request.url);
 if(request.method!=="GET"&&request.method!=="HEAD")
  return new Response("Method Not Allowed",{status:405,headers:{Allow:"GET, HEAD"}});
 if(u.pathname==="/health")
  return new Response(JSON.stringify({ok:true,readonly:true,publicImages:PUBLIC_PATHS.size,source:"gallery-only"}),{
   headers:{"Content-Type":"application/json","Cache-Control":"no-store",...BASE_HEADERS}
  });
 const path=safePublicPath(request.url);
 if(!path)return plain(404,"Image is not on public gallery allowlist");
 const cacheKey=new Request(new URL(path,u.origin),{method:"GET"});
 try{
  if(cache){
   const hit=await cache.match(cacheKey);
   if(hit&&hit.ok){
    const h=imageHeaders(hit.headers,"HIT");
    return new Response(request.method==="HEAD"?null:hit.body,{status:200,headers:h});
   }
  }
  const origin=SOURCE+path;
  const upstream=await fetcher(origin,{method:"GET",redirect:"manual",
    headers:{Accept:"image/avif,image/webp,image/png,image/jpeg,image/gif,*/*"},
    cf:{cacheEverything:true,cacheTtl:CACHE_TTL_SECONDS}});
  const type=upstream.headers.get("Content-Type")||"";
  const length=Number(upstream.headers.get("Content-Length")||0);
  if(!upstream.ok||!/^image\/(png|jpeg|webp|avif|gif|bmp)(?:;|$)/i.test(type)
    ||(length>0&&length>MAX_CONTENT_LENGTH))
   return plain(502,"Public image source unavailable");
  const response=new Response(request.method==="HEAD"?null:upstream.body,
   {status:200,headers:imageHeaders(upstream.headers,"MISS")});
  if(cache&&ctx.waitUntil&&request.method==="GET"){
   const save=response.clone();
   ctx.waitUntil(cache.put(cacheKey,save).catch(()=>{}));
  }
  return response;
 }catch{
  return plain(503,"Public image source unavailable");
 }
}
export default {fetch(request,env,ctx){return handleImageRoute(request,ctx);}};
