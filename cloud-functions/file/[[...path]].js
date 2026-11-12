import {createEdgeOneStore} from '../../src/server/edgeone-store.mjs';

const MIME={
 webp:'image/webp',
 png:'image/png',
 jpg:'image/jpeg',
 jpeg:'image/jpeg',
 gif:'image/gif',
 svg:'image/svg+xml',
 avif:'image/avif',
 json:'application/json',
};

const DEFAULT_UPSTREAM='https://img.casto.top/file/';
const MAX_FUNCTION_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5 MB threshold to avoid 413 CLOUD_FUNCTION_PAYLOAD_TOO_LARGE

export async function onRequest({request,params={},env={},store=null}){
 if(request.method!=='GET'&&request.method!=='HEAD'){
  return new Response('Method not allowed',{status:405});
 }

 const pathname=new URL(request.url).pathname;
 const rawPath=pathname.startsWith('/file/')?pathname.slice(6):(Array.isArray(params.path)?params.path.join('/'):(params.path||''));
 const key=decodeURIComponent(rawPath).replace(/^\/+/,'');

 if(!key||key.includes('..')||!/^[a-zA-Z0-9_\-./%()+ ]+$/.test(key)){
  return new Response('Invalid path',{status:400});
 }

 const ext=key.split('.').at(-1)?.toLowerCase()||'';
 const contentType=MIME[ext]||'application/octet-stream';
 const config={...process.env,...env};
 const upstreamOrigin=(config.FIREFLY_IMAGEBED_UPSTREAM_ORIGIN||DEFAULT_UPSTREAM).replace(/\/?$/,'/');
 const upstreamUrl=upstreamOrigin+key.split('/').map(encodeURIComponent).join('/');

 try{
  const storage=store||await createEdgeOneStore({env:config}).catch(()=>null);
  if(storage){
   const candidates=[key,'imagebed/'+key];
   for(const candidate of candidates){
    try{
     const rawStore=storage.store||(await import('@edgeone/pages-blob')).getStore({
      name:config.FIREFLY_BLOB_STORE_NAME||'firefly-content',
      consistency:'eventual',
     });
     const buf=await rawStore.get(candidate,{type:'arrayBuffer'});
     if(buf&&buf.byteLength>0){
      // For large assets (> 5MB), redirect to upstream CDN to prevent EdgeOne 413 payload limit
      if(buf.byteLength>MAX_FUNCTION_PAYLOAD_BYTES){
       return Response.redirect(upstreamUrl, 302);
      }
      return new Response(request.method==='HEAD'?null:buf,{
       status:200,
       headers:{
        'Content-Type':contentType,
        'Content-Length':String(buf.byteLength),
        'Cache-Control':'public, max-age=31536000, s-maxage=31536000, immutable',
        'X-Content-Type-Options':'nosniff',
        'Access-Control-Allow-Origin':'*',
       },
      });
     }
    }catch{}
   }
  }

  // Fallback to upstream origin and auto-cache to EdgeOne Blob
  const res=await fetch(upstreamUrl,{
   headers:{accept:'image/avif,image/webp,image/jpeg,image/png,image/gif,*/*'},
   signal:AbortSignal.timeout(6000),
  });

  if(!res.ok){
   return new Response('File not found',{status:404});
  }

  const cl=Number(res.headers.get('content-length')||0);
  if(cl>MAX_FUNCTION_PAYLOAD_BYTES){
   return Response.redirect(upstreamUrl, 302);
  }

  const buf=await res.arrayBuffer();
  if(buf.byteLength>MAX_FUNCTION_PAYLOAD_BYTES){
   return Response.redirect(upstreamUrl, 302);
  }

  const type=(res.headers.get('content-type')||contentType).split(';')[0];

  if(storage&&buf.byteLength>0){
   try{
    const rawStore=(await import('@edgeone/pages-blob')).getStore({
     name:config.FIREFLY_BLOB_STORE_NAME||'firefly-content',
    });
    await rawStore.set('imagebed/'+key,buf,{
     cacheControl:'public, max-age=31536000, immutable',
    });
   }catch{}
  }

  return new Response(request.method==='HEAD'?null:buf,{
   status:200,
   headers:{
    'Content-Type':type,
    'Content-Length':String(buf.byteLength),
    'Cache-Control':'public, max-age=31536000, s-maxage=31536000, immutable',
    'X-Content-Type-Options':'nosniff',
    'Access-Control-Allow-Origin':'*',
   },
  });
 }catch{
  return new Response('File delivery error',{status:502});
 }
}

export default onRequest;
