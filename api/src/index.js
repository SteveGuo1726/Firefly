/**
 * KIRA! JUMP — development read-only discovery API.
 * Data is isolated in kira-gallery-development D1.
 * No authentication, uploads, publishing or writes exposed.
 */
const AXES = new Set(['character','color','mood']);
const ORIGINS = new Set(['https://kira-source-lab-dev.guojunyang666666.workers.dev','https://kira-cf.casto.top','http://localhost:8787','http://127.0.0.1:8787']);
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

/* External art discovery: separate from KIRA's owned/approved artwork catalog.
 * Never bulk download, mirror images, strip credits, or mark external results as owned.
 * Single allow-listed remote request per cold cache miss; sources may change their terms.
 */
const OPENVERSE_CHANNELS=Object.freeze({anime:'anime illustration',manga:'manga illustration',pixel:'pixel art',cosplay:'anime cosplay',fantasy:'fantasy illustration',character:'anime character'});
const BOORU_CHANNELS=Object.freeze({miku:'hatsune_miku',touhou:'touhou',genshin:'genshin_impact',starrail:'honkai:_star_rail'});
const OPEN_LICENSES=new Set(['by','by-sa','cc0','pdm']);
function safeHttp(input,hosts=null){try{const u=new URL(input);return u.protocol==='https:'&&(!hosts||hosts.includes(u.hostname))?u.toString():null;}catch{return null;}}
function shortText(v,max=180){return typeof v==='string'?v.trim().slice(0,max):'';}
async function cachedUpstream(url,headers,ttl=21600,DB=null,source=''){
  // Edge-local cache does not guarantee a global quota: production must add a
  // daily global request budget or a publisher agreement before heavy usage.
  const key=new Request(url,{method:'GET'});
  const cache=caches.default;
  const hit=await cache.match(key);
  if(hit)return {upstream:await hit.json(),cache:'HIT'};
  // A shared D1 budget caps the *total* cold misses across Cloudflare PoPs.
  // This protects anonymous Openverse's 200/day limit and avoids abusing sources.
  if(DB&&source){
    const limit=source==='openverse'?60:8;
    const day=new Date().toISOString().slice(0,10);
    const row=await DB.prepare("INSERT INTO external_api_budget(source,day,calls) VALUES(?,?,1) ON CONFLICT(source,day) DO UPDATE SET calls=calls+1 WHERE calls<? RETURNING calls").bind(source,day,limit).first();
    if(!row)throw new Error('external_daily_budget_exhausted');
  }
  const rsp=await fetch(url,{headers,signal:AbortSignal.timeout(9000)});
  if(!rsp.ok)throw new Error('upstream_status_'+rsp.status);
  const body=await rsp.text();
  if(body.length>900000)throw new Error('upstream_response_oversize');
  const data=JSON.parse(body);
  await cache.put(key,new Response(body,{headers:{'content-type':'application/json','cache-control':'public, max-age='+ttl}}));
  return {upstream:data,cache:'MISS'};
}
async function exploreOpenverse(u,DB){
  const channel=u.searchParams.get('channel')||'anime';
  if(!Object.hasOwn(OPENVERSE_CHANNELS,channel))return json({error:'invalid_channel'},400);
  const page=Math.max(1,Math.min(5,Number.parseInt(u.searchParams.get('page')||'1',10)||1));
  const query=new URL('https://api.openverse.org/v1/images/');
  query.searchParams.set('q',OPENVERSE_CHANNELS[channel]);
  query.searchParams.set('page_size','16');
  query.searchParams.set('page',String(page));
  query.searchParams.set('license','by,by-sa,cc0,pdm');
  query.searchParams.set('mature','false');
  let data;
  try{data=await cachedUpstream(query.toString(),{'accept':'application/json','user-agent':'KiraJumpDevelopment/0.1 (https://github.com/SteveGuo1726/Firefly)'},21600,DB,'openverse');}
  catch(e){console.error('Openverse source error',e.message);return json({error:'external_source_unavailable',provider:'openverse',retry_after_seconds:1800},e.message==='external_daily_budget_exhausted'?429:503,{'retry-after':'1800'});}
  const items=(Array.isArray(data.upstream?.results)?data.upstream.results:[])
    .filter(x=>x.mature===false&&OPEN_LICENSES.has(x.license)&&safeHttp(x.thumbnail)&&safeHttp(x.foreign_landing_url)&&safeHttp(x.license_url))
    .slice(0,16).map(x=>({
       id:'openverse:'+x.id,provider:'openverse',title:shortText(x.title,140)||'未命名作品',
       creator:shortText(x.creator,100)||'未标注作者',creator_url:safeHttp(x.creator_url),
       license:x.license.toUpperCase(),license_url:safeHttp(x.license_url),
       thumbnail_url:safeHttp(x.thumbnail),width:x.width||null,height:x.height||null,
       source_url:safeHttp(x.foreign_landing_url),original_source_url:safeHttp(x.url),
       tags:(x.tags||[]).slice(0,8).map(t=>shortText(t.name,32)).filter(Boolean),
       attribution:shortText(x.attribution,500),rights_status:'open_license_claim_unverified',
       can_import:false
    }));
  return json({source:'openverse',channel,query:OPENVERSE_CHANNELS[channel],items,page,
      has_more:page<(data.upstream?.page_count||0),cache:data.cache,
      disclaimer:'开放许可来自上游提交者，需核验作品和上传者是否真正拥有该授权；不得自动入库。'});
}
async function exploreDanbooru(u,DB){
  const channel=u.searchParams.get('channel')||'miku';
  if(!Object.hasOwn(BOORU_CHANNELS,channel))return json({error:'invalid_channel'},400);
  const page=Math.max(1,Math.min(3,Number.parseInt(u.searchParams.get('page')||'1',10)||1));
  const url=new URL('https://safebooru.donmai.us/posts.json');
  url.searchParams.set('tags','rating:g '+BOORU_CHANNELS[channel]);
  url.searchParams.set('limit','16');url.searchParams.set('page',String(page));
  let data;
  try{data=await cachedUpstream(url.toString(),{'accept':'application/json','user-agent':'KiraJumpDevelopment/0.1 (github.com/SteveGuo1726/Firefly; metadata discovery)'},21600,DB,'danbooru');}
  catch(e){console.error('Danbooru source error',e.message);return json({error:'external_source_unavailable',provider:'danbooru',retry_after_seconds:1800},e.message==='external_daily_budget_exhausted'?429:503,{'retry-after':'1800'});}
  const items=(Array.isArray(data.upstream)?data.upstream:[]).filter(x=>x.rating==='g'&&!x.is_deleted&&!x.is_banned)
    .slice(0,16).map(x=>({
      id:'danbooru:'+x.id,provider:'danbooru',title:shortText(x.tag_string_character,120).replaceAll('_',' ')||'二次元插画',
      creator:shortText(x.tag_string_artist,100).replaceAll('_',' ')||'画师待核验',
      source_url:'https://safebooru.donmai.us/posts/'+x.id,
      pixiv_url:Number.isInteger(x.pixiv_id)?'https://www.pixiv.net/artworks/'+x.pixiv_id:null,
      tags:shortText(x.tag_string_character,130).split(' ').filter(Boolean).slice(0,5),
      series:shortText(x.tag_string_copyright,180),score:x.score||0,width:x.image_width||null,
      height:x.image_height||null,thumbnail_url:null,rights_status:'unknown_third_party_copyright',
      can_import:false
    }));
  return json({source:'danbooru',channel,items,page,has_more:items.length===16,cache:data.cache,
     disclaimer:'仅供外链发现的元数据；不抓取、不代理、不缓存图片文件。标签与链接不表示二次转载授权。'});
}

export default {async fetch(request,env){
  const headers=cors(request);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!['GET','HEAD'].includes(request.method))return json({error:'method_not_allowed'},405,headers);
  const u=new URL(request.url),path=u.pathname.replace(/\/$/,'')||'/';
  try {
    if(path==='/health')return json({ok:true,service:'kira-gallery-api-dev',db:!!env.DB,version:'0.2.0'},200,headers);
    if(path==='/api/v1/works')return addCors(await listWorks(env.DB,u),headers,request.method==='HEAD');
    if(path==='/api/v1/external/openverse')return addCors(await exploreOpenverse(u,env.DB),headers,request.method==='HEAD');
    if(path==='/api/v1/external/danbooru')return addCors(await exploreDanbooru(u,env.DB),headers,request.method==='HEAD');
    if(path==='/api/v1/jump')return addCors(await jump(env.DB,u),headers,request.method==='HEAD');
    const workId=path.match(/^\/api\/v1\/works\/([a-zA-Z0-9][\w-]{0,80})$/);
    if(workId)return addCors(await getWork(env.DB,workId[1]),headers,request.method==='HEAD');
    return json({error:'not_found'},404,headers);
  }catch(error){console.error('kira api error',error?.message);return json({error:'internal_error'},500,headers);}
}};
function addCors(response,headers,head){const out=new Headers(response.headers);for(const [key,value] of Object.entries(headers))out.set(key,value);return new Response(head?null:response.body,{status:response.status,headers:out});}
