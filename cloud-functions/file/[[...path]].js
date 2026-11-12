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

export async function onRequest({request,params={},env={},store=null}){
 if(request.method!=='GET'&&request.method!=='HEAD'){
  return new Response('Method not allowed',{status:405});
 }

 const rawPath=params.path||new URL(request.url).pathname.replace(/^\/file\//,'');
 const key=decodeURIComponent(rawPath).replace(/^\/+/,'');

 if(!key||key.includes('..')||!/^[a-zA-Z0-9_\-./]+$/.test(key)){
  return new Response('Invalid path',{status:400});
 }

 const ext=key.split('.').at(-1)?.toLowerCase()||'';
 const contentType=MIME[ext]||'application/octet-stream';
 const config={...process.env,...env};

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
  const upstreamUrl=(config.FIREFLY_IMAGEBED_UPSTREAM_ORIGIN||DEFAULT_UPSTREAM).replace(/\/?$/,'/')+key;
  const res=await fetch(upstreamUrl,{
   headers:{accept:'image/avif,image/webp,image/jpeg,image/png,image/gif,*/*'},
   signal:AbortSignal.timeout(6000),
  });

  if(!res.ok){
   return new Response('File not found',{status:404});
  }

  const buf=await res.arrayBuffer();
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
