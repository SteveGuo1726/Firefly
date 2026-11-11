// Cache-only public photo delivery. No arbitrary URL proxying or private album access.
import snapshot from '../../public/assets/gallery-historical-snapshot.json' with {type:'json'};
import {createEdgeOneStore} from '../../src/server/edgeone-store.mjs';

const PUBLIC='https://gallery-api.casto.top/api/gallery/public';
const DEFAULT_ORIGIN='https://img.casto.top/file/';

export async function onRequest({request,env={},store=null}){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 const key=new URL(request.url).searchParams.get('key')||'';
 if(!/^photos\/[a-z0-9_-]+\/[a-zA-Z0-9_.-]{1,180}\.(?:jpg|jpeg|png|webp|avif|gif)$/i.test(key)||key.includes('..')){
  return new Response('Invalid image key',{status:400});
 }
 const config={...process.env,...env};
 try{
  let allowed=false;
  const isPublicAlbum=a=>!a.encrypted&&!a.private&&!a.protected&&!a.password&&!a.passwordHash;
  const matchPhoto=a=>Array.isArray(a.photoOrder||a.photos)&&(a.photoOrder?.includes(key)||a.photos?.some(p=>(p.key||p)===key));
  try{
   const storage=store||await createEdgeOneStore({env:config}).catch(()=>null);
   const manifest=storage?await storage.getJSON('firefly/gallery/manifest/v1.json'):null;
   const target=manifest||snapshot;
   if(Array.isArray(target?.albums)){
    allowed=target.albums.some(a=>isPublicAlbum(a)&&matchPhoto(a));
   }
  }catch{
   allowed=snapshot.albums.some(a=>isPublicAlbum(a)&&matchPhoto(a));
  }
  if(!allowed){
   try{
    const r=await fetch(PUBLIC,{headers:{accept:'application/json'},signal:AbortSignal.timeout(3000)});
    if(r.ok){
     const d=await r.json();
     allowed=Array.isArray(d.albums)&&d.albums.some(a=>isPublicAlbum(a)&&matchPhoto(a));
    }
   }catch{}
  }
  if(!allowed)return new Response('Not found',{status:404});

  const origin=(config.FIREFLY_IMAGEBED_ORIGIN||DEFAULT_ORIGIN).replace(/\/?$/,'/');
  const url=origin+key.split('/').map(encodeURIComponent).join('/');
  const image=await fetch(url,{headers:{accept:'image/avif,image/webp,image/jpeg,image/png,image/gif'}});
  if(!image.ok)return new Response('Photo unavailable',{status:502});

  const type=(image.headers.get('content-type')||'').split(';')[0];
  if(!/^image\/(?:jpeg|png|webp|avif|gif)$/.test(type))return new Response('Unsupported image',{status:415});
  const size=Number(image.headers.get('content-length')||0);
  if(size>25_000_000)return new Response('Image too large',{status:413});

  return new Response(image.body,{
   status:200,
   headers:{
    'content-type':type,
    'cache-control':'public,max-age=31536000,s-maxage=31536000,immutable',
    'x-content-type-options':'nosniff',
    'x-robots-tag':'noindex',
   },
  });
 }catch{
  return new Response('Image proxy temporarily unavailable',{status:503});
 }
}
