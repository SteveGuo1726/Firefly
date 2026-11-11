import {createEdgeOneStore} from '../../../src/server/edgeone-store.mjs';
import {createGalleryIndex,publicGalleryManifest} from '../../../src/server/gallery.mjs';
import {isAuthenticated,sameOrigin} from '../../../src/server/auth.mjs';
const json=(x,status=200)=>Response.json(x,{status,headers:{'cache-control':'no-store, private','x-content-type-options':'nosniff'}});
export async function onRequest({request,env={},store=null}){
 const config={...process.env,...env};
 const admin=isAuthenticated(request,config),method=request.method.toUpperCase();
 if(method!=='GET'&&method!=='PUT')return json({error:'Method not allowed'},405);
 if(method==='PUT'&&!admin)return json({error:'Unauthorized'},401);
 if(method==='PUT'&&(!sameOrigin(request)||request.headers.get('x-firefly-cms')!=='1'))return json({error:'Forbidden origin'},403);
 try{
  const storage=store||await createEdgeOneStore({env:config});
  const gallery=createGalleryIndex(storage,{
    enableWrites:config.FIREFLY_ENABLE_WRITES!=='0'});
  if(method==='PUT'){
   if(Number(request.headers.get('content-length')||0)>1_100_000)return json({error:'Too large'},413);
   const input=await request.json();
   return json({manifest:await gallery.save(input.manifest,{expectedRevision:input.expectedRevision??null})});
  }
  const m=await gallery.get();
  if(!m)return json({error:'Gallery manifest not imported into EdgeOne'},503);
  return json(admin?m:publicGalleryManifest(m));
 }catch(e){return json({error:e.status?e.message:'Gallery backend unavailable'},e.status||503)}
}
