/**
 * KIRA! JUMP — development read-only discovery API.
 * Data is isolated in kira-gallery-development D1.
 * No authentication, uploads, publishing or writes exposed.
 */
const AXES = new Set(['character','color','mood']);
const ORIGINS = new Set(['https://kira-cf.casto.top','http://localhost:8787','http://127.0.0.1:8787']);
const MAX_PAGE = 24;
const json = (data,status=200,extras={}) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff','cache-control':status===200?'public, max-age=20, s-maxage=90':'no-store',...extras}});
function cors(req){const origin=req.headers.get('origin');return origin && ORIGINS.has(origin)?{'access-control-allow-origin':origin,'access-control-allow-methods':'GET,HEAD,OPTIONS','access-control-allow-headers':'content-type','vary':'Origin'}:{'vary':'Origin'};}
function decodeCursor(raw,order){if(!raw)return null;try{const v=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')));if(!Array.isArray(v)||v.length!==3||v[0]!==order||typeof v[2]!=='string')return null;return v;}catch{return null;}}
function encodeCursor(order,w){const value=order==='popular'?w.like_count:w.published_at;return btoa(JSON.stringify([order,value,w.id])).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');}
function bounded(val,defaultVal=12){const n=Number.parseInt(val||'',10);return Number.isFinite(n)?Math.max(1,Math.min(MAX_PAGE,n)):defaultVal;}
const BASE = "SELECT w.id,w.title,w.description,w.creator_id,c.handle AS creator_handle,c.display_name AS creator_name,c.avatar_url AS creator_avatar,w.like_count,w.published_at FROM works w JOIN creators c ON c.id=w.creator_id WHERE w.status='published' AND w.content_rating='general'";
async function hydrate(DB,rows){
  if(!rows.length)return [];
  const q=rows.map(()=>'?').join(',');
  const ids=rows.map(x=>x.id);
  const [ar,fr]=await Promise.all([
    DB.prepare(`SELECT id,work_id,position,media_type,mime_type,width,height,bytes,thumbnail_url,preview_url,original_url FROM assets WHERE work_id IN (${q}) ORDER BY work_id,position`).bind(...ids).all(),
    DB.prepare(`SELECT work_id,axis,value FROM work_facets WHERE work_id IN (${q}) ORDER BY axis,value`).bind(...ids).all()
  ]);
  const a=new Map(),f=new Map();
  for(const x of ar.results||[]){if(!a.has(x.work_id))a.set(x.work_id,[]);a.get(x.work_id).push({id:x.id,position:x.position,width:x.width,height:x.height,bytes:x.bytes,mime_type:x.mime_type,thumbnail_url:x.thumbnail_url,preview_url:x.preview_url,original_url:x.original_url});}
  for(const x of fr.results||[]){if(!f.has(x.work_id))f.set(x.work_id,{character:[],color:[],mood:[],series:[],tag:[]});f.get(x.work_id)[x.axis]?.push(x.value);}
  return rows.map(w=>({...w,assets:a.get(w.id)||[],facets:f.get(w.id)||{character:[],color:[],mood:[],series:[],tag:[]}}));
}
async function listWorks(DB,u){
  const order=u.searchParams.get('order')==='popular'?'popular':'latest';
  const limit=bounded(u.searchParams.get('limit'));
  const encoded=u.searchParams.get('cursor');
  const cursor=decodeCursor(encoded,order);
  if(encoded&&!cursor)return json({error:'invalid_cursor'},400);
  const col=order==='popular'?'w.like_count':'w.published_at';
  let sql=BASE,params=[];
  if(cursor){sql+=` AND (${col} < ? OR (${col} = ? AND w.id < ?))`;params=[cursor[1],cursor[1],cursor[2]];}
  sql+=` ORDER BY ${col} DESC,w.id DESC LIMIT ?`;params.push(limit+1);
  const rows=(await DB.prepare(sql).bind(...params).all()).results||[];
  const has_more=rows.length>limit,items=await hydrate(DB,rows.slice(0,limit));
  return json({items,next_cursor:has_more?encodeCursor(order,rows[limit-1]):null,order});
}
async function getWork(DB,id){
  const work=await DB.prepare(BASE+' AND w.id=? LIMIT 1').bind(id).first();
  if(!work)return json({error:'not_found'},404);
  return json({work:(await hydrate(DB,[work]))[0]});
}
async function jump(DB,u){
  const seed=u.searchParams.get('seed')||'',axis=u.searchParams.get('axis')||'character',limit=bounded(u.searchParams.get('limit'),9);
  if(!/^[a-zA-Z0-9][\w-]{0,80}$/.test(seed)||!AXES.has(axis))return json({error:'invalid_jump_parameters'},400);
  const seedFound=await DB.prepare(BASE+' AND w.id=? LIMIT 1').bind(seed).first();
  if(!seedFound)return json({error:'seed_not_found'},404);
  // Matching facet labels are indexed. A work is never recommended to itself.
  const sql=`SELECT w.id,w.title,w.description,w.creator_id,c.handle AS creator_handle,c.display_name AS creator_name,c.avatar_url AS creator_avatar,w.like_count,w.published_at,COUNT(*) AS match_score FROM work_facets a JOIN work_facets b ON b.axis=a.axis AND b.value=a.value JOIN works w ON w.id=b.work_id JOIN creators c ON c.id=w.creator_id WHERE a.work_id=? AND a.axis=? AND b.work_id<>? AND w.status='published' AND w.content_rating='general' GROUP BY w.id ORDER BY match_score DESC,w.like_count DESC,w.id DESC LIMIT ?`;
  const rows=(await DB.prepare(sql).bind(seed,axis,seed,limit).all()).results||[];
  return json({seed,axis,items:await hydrate(DB,rows)});
}
export default {async fetch(request,env){
  const headers=cors(request);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!['GET','HEAD'].includes(request.method))return json({error:'method_not_allowed'},405,headers);
  const u=new URL(request.url),path=u.pathname.replace(/\/$/,'')||'/';
  try {
    if(path==='/health')return json({ok:true,service:'kira-gallery-api-dev',db:!!env.DB,version:'0.1.0'},200,headers);
    if(path==='/api/v1/works')return addCors(await listWorks(env.DB,u),headers,request.method==='HEAD');
    if(path==='/api/v1/jump')return addCors(await jump(env.DB,u),headers,request.method==='HEAD');
    const workId=path.match(/^\/api\/v1\/works\/([a-zA-Z0-9][\w-]{0,80})$/);
    if(workId)return addCors(await getWork(env.DB,workId[1]),headers,request.method==='HEAD');
    return json({error:'not_found'},404,headers);
  }catch(error){console.error('kira api error',error?.message);return json({error:'internal_error'},500,headers);}
}};
function addCors(response,headers,head){const out=new Headers(response.headers);for(const [key,value] of Object.entries(headers))out.set(key,value);return new Response(head?null:response.body,{status:response.status,headers:out});}
