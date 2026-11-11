import {createEdgeOneStore} from '../../src/server/edgeone-store.mjs';
import {publicGalleryManifest} from '../../src/server/gallery.mjs';
import snapshot from '../../public/assets/gallery-historical-snapshot.json' with {type:'json'};

export async function onRequest({request,env={},store=null}){
 if(request.method!=='GET')return Response.json({error:'Method not allowed'},{status:405});
 const config={...process.env,...env};
 try{
  const storage=store||await createEdgeOneStore({env:config}).catch(()=>null);
  if(storage){
   const manifest=await storage.getJSON('firefly/gallery/manifest/v1.json');
   if(manifest&&Array.isArray(manifest.albums)){
    return Response.json(publicGalleryManifest(manifest),{
     headers:{
      'Content-Type':'application/json;charset=utf-8',
      'Cache-Control':'public,max-age=60,s-maxage=3600,stale-while-revalidate=86400',
      'X-Content-Type-Options':'nosniff',
     },
    });
   }
  }
 }catch{}
 try{
  const r=await fetch('https://gallery-api.casto.top/api/gallery/public',{
   headers:{accept:'application/json'},
   redirect:'error',
   signal:AbortSignal.timeout(3000),
  });
  if(r.ok){
   const text=await r.text();
   return new Response(text,{
    headers:{
     'Content-Type':'application/json;charset=utf-8',
     'Cache-Control':'public,max-age=60,s-maxage=3600,stale-while-revalidate=86400',
     'X-Content-Type-Options':'nosniff',
    },
   });
  }
 }catch{}
 return Response.json(snapshot,{
  headers:{
   'Content-Type':'application/json;charset=utf-8',
   'Cache-Control':'public,max-age=60,s-maxage=3600,stale-while-revalidate=86400',
   'X-Content-Type-Options':'nosniff',
  },
 });
}
