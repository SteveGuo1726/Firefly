/** Original managers request this path BEFORE loading live overrides.
 * Fail closed for anonymous clients: static content must not reveal drafts.
 * Merges baseline posts with CMS overrides for authenticated administrators.
 */
import {isAuthenticated} from '../../src/server/auth.mjs';
import {createCms} from '../../src/server/live-cms.mjs';
import {createEdgeOneStore} from '../../src/server/edgeone-store.mjs';
import {publicBaselinePosts} from '../../src/server/post-resolver.mjs';

const json=(v,status=200)=>Response.json(v,{status,headers:{'cache-control':'private,no-store','x-content-type-options':'nosniff'}});
export async function getAdminContentIndex({request,env={},store=null}){
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 const config={...process.env,...env};
 if(!isAuthenticated(request,config))return json({error:'Unauthorized'},401);
 try{
  const storage=store||await createEdgeOneStore({env:config});
  const cms=createCms(storage,{enableWrites:config.FIREFLY_ENABLE_WRITES!=='0'});
  const [posts,dynamics]=await Promise.all([
   cms.list('posts',{publicOnly:false}),cms.list('dynamic',{publicOnly:false})]);
  const cmsIds=new Set(posts.map(x=>x.id));
  const cmsPosts=posts.filter(x=>x.state!=='deleted').map(x=>({
    id:x.id,path:x.fields?.path||'src/content/posts/'+x.id+'.md',title:x.title,
    description:x.fields?.description||'',published:x.publishedAt||'',updated:x.updatedAt||'',
    category:x.fields?.category||'',tags:x.fields?.tags||[],draft:x.state!=='published',
    pinned:x.fields?.pinned===true,image:x.fields?.image||''
  }));
  const baselineEntries=Object.entries(publicBaselinePosts)
   .filter(([slug])=>!cmsIds.has(slug))
   .map(([slug,base])=>({
     id:slug,path:'src/content/posts/'+slug+'.md',title:base.title||slug,
     description:base.fields?.description||'',published:base.publishedAt||'',updated:base.publishedAt||'',
     category:base.fields?.category||'',tags:base.fields?.tags||[],draft:false,
     pinned:false,image:''
   }));
  return json({
    posts:[...cmsPosts,...baselineEntries],
    dynamics:dynamics.filter(x=>x.state!=='deleted').map(x=>({
     id:x.id,path:x.fields?.path||'src/content/dynamic/'+x.id+'.md',
     published:x.publishedAt||'',pinned:x.fields?.pinned===true}))
  });
 }catch{return json({error:'Content storage unavailable'},503)}
}

export async function onRequest(context){
 return getAdminContentIndex(context);
}
