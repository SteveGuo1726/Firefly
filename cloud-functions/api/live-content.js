/**
 * Backwards-compatible read & write API for the recovered 2026-10-13 admin bundles
 * and the public site-statistics overlay.
 * /index is public-safe: anonymous clients only receive published entries plus
 * content-free tombstone markers. Item/history/export expose drafts and private
 * data and therefore require a session. Authenticated writes persist to EdgeOne Blob.
 */
import {createEdgeOneStore} from '../../src/server/edgeone-store.mjs';
import {createCms,publicContentItem} from '../../src/server/live-cms.mjs';
import {isAuthenticated,sameOrigin} from '../../src/server/auth.mjs';

function frontmatter(body,fields){
 const keys=Object.entries(fields).filter(([k,v])=>typeof k==='string'&&v!==undefined);
 return '---\n'+keys.map(([k,v])=>JSON.stringify(k)+': '+JSON.stringify(v)).join('\n')+'\n---\n'+body;
}
function parseSource(source,fallbackMeta={}){
 if(typeof source!=='string')return {body:'',fields:fallbackMeta};
 const match=source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
 if(!match)return {body:source,fields:fallbackMeta};
 return {body:match[2],fields:fallbackMeta};
}
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'private,no-store','x-content-type-options':'nosniff'}});
function kindOf(raw){
 if(raw==='post'||raw==='posts')return 'posts';
 if(raw==='dynamic')return 'dynamic';
 return null;
}
const idValid=id=>typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(id);
function asLegacy(item){
 const kind=item.kind==='posts'?'post':'dynamic',meta={...(item.fields||{})};
 const source=typeof item.source==='string'?item.source:frontmatter(item.body||'',meta);
 return {kind,id:item.id,path:meta.path||'src/content/'+(kind==='post'?'posts':'dynamic')+'/'+item.id+'.md',
  source,meta:{...meta,title:item.title,published:item.publishedAt||meta.published||'',draft:item.state!=='published'},
  updated:item.updatedAt||'',rev:item.rev||null};
}
export async function onRequest({request,env={},store=null}){
 const config={...process.env,...env};
 const url=new URL(request.url),action=url.pathname.replace(/\/+$/,'').split('/').at(-1);
 const isWrite=request.method!=='GET';
 if(isWrite){
  if(!isAuthenticated(request,config))return json({error:'Unauthorized'},401);
  if(!sameOrigin(request)||request.headers.get('x-firefly-cms')!=='1')return json({error:'Forbidden write origin'},403);
  if(config.FIREFLY_ENABLE_WRITES==='0')return json({error:'Writes disabled by configuration'},503);
 }
 const admin=isAuthenticated(request,config);
 if(!admin&&action!=='index')return json({error:'Unauthorized'},401);
 try{
  const cms=createCms(store||await createEdgeOneStore({env:config}),{enableWrites:config.FIREFLY_ENABLE_WRITES!=='0'});
  const kind=kindOf(url.searchParams.get('kind'))||'posts',id=url.searchParams.get('id');

  if(request.method==='PUT'&&action==='item'){
   const data=await request.json().catch(()=>({}));
   const targetKind=kindOf(data.kind)||kind;
   const targetId=String(data.id||'');
   if(!idValid(targetId))return json({error:'Invalid content identifier'},400);
   const {body,fields}=parseSource(data.source,data.meta||{});
   const meta=data.meta||{};
   const title=String(meta.title||fields.title||targetId);
   const state=meta.draft?'draft':(meta.state||'published');
   const publishedAt=meta.published||fields.published||null;
   const expectedRev=data.expectedRevision||null;
   const saved=await cms.commit(targetKind,targetId,{title,body,state,fields:{...fields,...meta},publishedAt},{expectedRev,mode:'upsert'});
   return json(asLegacy(saved));
  }
  if(request.method==='DELETE'&&action==='item'){
   if(!idValid(id))return json({error:'Invalid content identifier'},400);
   const data=await request.json().catch(()=>({}));
   const expectedRev=data.expectedRevision||null;
   const doomed=await cms.tombstone(kind,id,{expectedRev});
   return json({...asLegacy(doomed),deleted:true});
  }
  if(request.method==='POST'&&action==='restore'){
   const data=await request.json().catch(()=>({}));
   const targetKind=kindOf(data.kind)||kind;
   const targetId=String(data.id||'');
   if(!idValid(targetId))return json({error:'Invalid content identifier'},400);
   const restored=await cms.restore(targetKind,targetId,data.revision,{expectedRev:data.expectedRevision||null});
   return json(asLegacy(restored));
  }
  if(request.method==='POST'&&action==='undo-delete'){
   const data=await request.json().catch(()=>({}));
   const targetKind=kindOf(data.kind)||kind;
   const targetId=String(data.id||'');
   if(!idValid(targetId))return json({error:'Invalid content identifier'},400);
   const restored=await cms.commit(targetKind,targetId,{state:'published'},{expectedRev:data.expectedRevision||null,mode:'update'});
   return json(asLegacy(restored));
  }

  if(request.method!=='GET')return json({error:'Method not allowed'},405);

  if(action==='index'){
   const items=await cms.list(kind,{publicOnly:false});
   const entries=items.map(item=>{
    const legacy=asLegacy(item),published=publicContentItem(item);
    if(admin)return {...legacy,deleted:item.state==='deleted',hidden:item.state!=='published'};
    if(!published)return {id:item.id,kind:legacy.kind,deleted:item.state==='deleted',hidden:true,updatedAt:item.updatedAt};
    return {id:item.id,kind:legacy.kind,deleted:false,hidden:false,updatedAt:item.updatedAt,
     meta:{published:legacy.meta.published,draft:false}};
   });
   return json({kind,entries});
  }
  if(action==='item'){
   if(!idValid(id))return json({error:'Invalid content identifier'},400);
   const item=await cms.load(kind,id);
   if(!item)return json({error:'Not found'},404);
   return json({...asLegacy(item),public:Boolean(publicContentItem(item))});
  }
  if(action==='history'){
   if(!idValid(id))return json({error:'Invalid content identifier'},400);
   if(!(await cms.load(kind,id)))return json({error:'Not found'},404);
   const hist=await cms.history(kind,id);
   return json({kind,id,history:hist,entries:hist});
  }
  if(action==='export'){
   const [posts,dynamics]=await Promise.all([
    cms.list('posts',{publicOnly:false}),cms.list('dynamic',{publicOnly:false})]);
   return json({version:1,exportedAt:new Date().toISOString(),
    posts:posts.map(asLegacy),dynamics:dynamics.map(asLegacy)});
  }
  return json({error:'Not found'},404);
 }catch(e){
  const status=e?.status||503;
  return json({error:e?.message||'Content storage unavailable'},status);
 }
}
