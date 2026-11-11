/** Authenticated photo management. Supports native EdgeOne Blob storage and upstream fallback. */
import {isAuthenticated,sameOrigin} from '../../../src/server/auth.mjs';
import {createEdgeOneStore} from '../../../src/server/edgeone-store.mjs';

const DEFAULT_BASE='https://img.casto.top';
const validFolder=v=>typeof v==='string'&&/^photos\/[a-zA-Z0-9_-]{1,100}$/.test(v);
const validKey=v=>typeof v==='string'&&/^photos\/[a-zA-Z0-9_-]{1,100}\/[a-zA-Z0-9_.-]{1,190}$/.test(v)&&!v.includes('..');

function respond(x,status=200){
 return Response.json(x,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
}

export async function onRequest({request,env={},store=null}){
 const config={...process.env,...env};
 if(!isAuthenticated(request,config))return respond({error:'Unauthorized'},401);
 if(request.method!=='GET'&&(!sameOrigin(request)||request.headers.get('x-firefly-cms')!=='1')){
  return respond({error:'Forbidden origin'},403);
 }

 const url=new URL(request.url),action=url.searchParams.get('action')||'list';
 const useUpstream=config.FIREFLY_IMAGEBED_STORAGE==='upstream';

 if(useUpstream){
  const token=config.FIREFLY_IMAGEBED_TOKEN;
  if(!token)return respond({error:'Configure FIREFLY_IMAGEBED_TOKEN in EdgeOne (not in GitHub)'},503);
  const base=(config.FIREFLY_IMAGEBED_BASE||DEFAULT_BASE).replace(/\/$/,'');
  async function upstream(path,init={}){
   const headers=new Headers(init.headers);
   headers.set('Authorization',token);
   headers.set('Accept','application/json');
   const r=await fetch(base+path,{...init,headers});
   const payload=await r.json().catch(()=>({error:'Invalid imagebed response'}));
   if(!r.ok)throw Object.assign(new Error(payload.message||payload.error||'Imagebed request failed'),{status:r.status});
   return payload;
  }
  try{
   if(action==='list'&&request.method==='GET'){
    const dir=url.searchParams.get('dir')||'photos';
    if(dir!=='photos'&&!validFolder(dir))return respond({error:'Invalid directory'},400);
    const p=await upstream(`/api/manage/list?dir=${encodeURIComponent(dir)}&count=-1&recursive=${url.searchParams.get('recursive')==='true'}`);
    return respond({files:p.files||[],directories:p.directories||[]});
   }
   if(action==='upload'&&request.method==='POST'){
    const dir=url.searchParams.get('folder');
    if(!validFolder(dir))return respond({error:'Invalid folder'},400);
    if(Number(request.headers.get('content-length')||0)>31_000_000)return respond({error:'File too large'},413);
    const f=(await request.formData()).get('file');
    if(!(f instanceof File)||!/^image\/(?:jpeg|png|webp|avif|gif)$/.test(f.type)||f.size>30_000_000)return respond({error:'Invalid image or exceeds 30MB'},400);
    const form=new FormData();
    form.append('file',f,f.name);
    const payload=await upstream(`/upload?uploadFolder=${encodeURIComponent(dir)}&uploadNameType=origin&returnFormat=full`,{method:'POST',body:form});
    return respond({files:payload});
   }
   if((action==='delete'||action==='rename')&&request.method==='POST'){
    const data=await request.json();
    if(!validKey(data?.key))return respond({error:'Invalid image key'},400);
    if(action==='delete'){
     await upstream(`/api/manage/delete/${data.key.split('/').map(encodeURIComponent).join('/')}`,{method:'GET'});
     return respond({ok:true});
    }
    if(!validKey(data?.newKey))return respond({error:'Invalid target key'},400);
    const payload=await upstream(`/api/manage/rename/${data.key.split('/').map(encodeURIComponent).join('/')}`,{
     method:'POST',
     headers:{'content-type':'application/json'},
     body:JSON.stringify({newFileId:data.newKey}),
    });
    return respond({ok:true,newKey:payload.newFileId});
   }
   return respond({error:'Method or action not allowed'},405);
  }catch(e){
   return respond({error:e?.status?e.message:'Imagebed unavailable'},e?.status&&e.status>=400&&e.status<600?e.status:503);
  }
 }

 try{
  const storage=store||await createEdgeOneStore({env:config});
  const rawStore=storage.store||(await import('@edgeone/pages-blob')).getStore({
   name:config.FIREFLY_BLOB_STORE_NAME||'firefly-content',
  });

  if(action==='list'&&request.method==='GET'){
   const dir=url.searchParams.get('dir')||'photos';
   if(dir!=='photos'&&!validFolder(dir))return respond({error:'Invalid directory'},400);

   const prefix='imagebed/'+(dir==='photos'?'photos/':dir.replace(/\/?$/,'/'));
   const listRes=await rawStore.list({prefix,limit:500}).catch(()=>({blobs:[],directories:[]}));
   const files=(listRes.blobs||[]).map(b=>{
    const cleanKey=b.key.replace(/^imagebed\//,'');
    const ext=cleanKey.split('.').at(-1)?.toLowerCase()||'';
    const mime=ext==='webp'?'image/webp':ext==='png'?'image/png':'image/jpeg';
    return {
     name:cleanKey,
     key:cleanKey,
     metadata:{
      FileSizeBytes:b.size||0,
      FileType:mime,
      TimeStamp:Date.now(),
     },
    };
   });

   return respond({files,directories:listRes.directories||[]});
  }

  if(action==='upload'&&request.method==='POST'){
   const dir=url.searchParams.get('folder');
   if(!validFolder(dir))return respond({error:'Invalid folder'},400);
   if(Number(request.headers.get('content-length')||0)>31_000_000)return respond({error:'File too large'},413);

   const formData=await request.formData();
   const f=formData.get('file');
   if(!(f instanceof File)||!/^image\/(?:jpeg|png|webp|avif|gif)$/.test(f.type)||f.size>30_000_000){
    return respond({error:'Invalid image or exceeds 30MB'},400);
   }

   const filename=f.name.replace(/[^a-zA-Z0-9_.-]/g,'_');
   const relKey=`${dir}/${filename}`;
   const buf=await f.arrayBuffer();

   await rawStore.set('imagebed/'+relKey,buf,{cacheControl:'public, max-age=31536000, immutable'});
   await rawStore.set(relKey,buf,{cacheControl:'public, max-age=31536000, immutable'});

   return respond({
    files:[{
     src:'/file/'+relKey,
     id:relKey,
    }],
   });
  }

  if((action==='delete'||action==='rename')&&request.method==='POST'){
   const data=await request.json();
   if(!validKey(data?.key))return respond({error:'Invalid image key'},400);

   if(action==='delete'){
    await rawStore.delete('imagebed/'+data.key).catch(()=>{});
    await rawStore.delete(data.key).catch(()=>{});
    return respond({ok:true});
   }

   if(!validKey(data?.newKey))return respond({error:'Invalid target key'},400);
   const oldBuf=await rawStore.get('imagebed/'+data.key,{type:'arrayBuffer'}).catch(()=>null)
    ||await rawStore.get(data.key,{type:'arrayBuffer'}).catch(()=>null);

   if(oldBuf){
    await rawStore.set('imagebed/'+data.newKey,oldBuf,{cacheControl:'public, max-age=31536000, immutable'});
    await rawStore.set(data.newKey,oldBuf,{cacheControl:'public, max-age=31536000, immutable'});
    await rawStore.delete('imagebed/'+data.key).catch(()=>{});
    await rawStore.delete(data.key).catch(()=>{});
   }

   return respond({ok:true,newKey:data.newKey});
  }

  return respond({error:'Method or action not allowed'},405);
 }catch(e){
  return respond({error:e?.status?e.message:'EdgeOne storage error: '+(e?.message||'unknown')},503);
 }
}
