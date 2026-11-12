// EdgeOne live dynamic overlay with tombstone/private suppression.
// Storage failure falls back to the pinned public baseline so the page keeps
// rendering; the fallback is explicitly marked for diagnostics.
import {createEdgeOneStore} from '../../../src/server/edgeone-store.mjs';
import {overlayPublicDynamic} from '../../../src/server/live-dynamic-feed.mjs';
import defaultBaseline from '../../../src/data/recovered-public-dynamic.json';

export async function onRequest({request,env={},store=null,baseline=null}){
 if(request.method!=='GET')return Response.json({error:'Method not allowed'},{status:405});
 const initialBaseline=Array.isArray(baseline)?baseline:defaultBaseline;
 if(!Array.isArray(initialBaseline))return Response.json({error:'Dynamic feed temporarily unavailable'},{status:503,headers:{'cache-control':'no-store'}});
 try {
  const rows=await overlayPublicDynamic(store||await createEdgeOneStore({env:{...process.env,...env}}),initialBaseline);
  return Response.json(rows,{headers:{'cache-control':'public,max-age=15','x-content-type-options':'nosniff'}});
 }catch{
  return Response.json(initialBaseline,{headers:{'cache-control':'public,max-age=30','x-content-type-options':'nosniff','x-firefly-live':'unavailable'}});
 }
}
