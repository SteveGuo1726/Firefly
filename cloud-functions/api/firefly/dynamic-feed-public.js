// EdgeOne live dynamic overlay with tombstone/private suppression.
// Storage failure falls back to the pinned public baseline so the page keeps
// rendering; the fallback is explicitly marked for diagnostics.
import {createEdgeOneStore} from '../../../src/server/edgeone-store.mjs';
import {overlayPublicDynamic} from '../../../src/server/live-dynamic-feed.mjs';
export async function onRequest({request,env={},store=null,baseline=null}){
 if(request.method!=='GET')return Response.json({error:'Method not allowed'},{status:405});
 if(!Array.isArray(baseline)){
  try {
   const url=new URL('/assets/recovered-public-dynamic.json',request.url);
   const r=await fetch(url,{headers:{accept:'application/json'}});
   if(!r.ok)throw Error('Missing recovered public dynamic baseline');
   baseline=await r.json();
  }catch{return Response.json({error:'Dynamic feed temporarily unavailable'},{status:503,headers:{'cache-control':'no-store'}})}
 }
 if(!Array.isArray(baseline))return Response.json({error:'Dynamic feed temporarily unavailable'},{status:503,headers:{'cache-control':'no-store'}});
 try {
  const rows=await overlayPublicDynamic(store||await createEdgeOneStore({env:{...process.env,...env}}),baseline);
  return Response.json(rows,{headers:{'cache-control':'public,max-age=15','x-content-type-options':'nosniff'}});
 }catch{
  return Response.json(baseline,{headers:{'cache-control':'public,max-age=30','x-content-type-options':'nosniff','x-firefly-live':'unavailable'}});
 }
}
