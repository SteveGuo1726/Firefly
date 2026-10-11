/**
 * KIRA / Free Pixiv metadata feed — independently deployed Cloudflare development adapter.
 * No credentials, no Paywall, no image copying, no general-purpose proxy.
 * Uses public community-indexed Pixiv metadata API; attribution and source retained.
 */
const CHANNELS=Object.freeze({
  discover:'',miku:'初音ミク',genshin:'原神',starrail:'崩壊:スターレイル',
  bluearchive:'ブルーアーカイブ',touhou:'東方Project',girl:'女の子',
  scenery:'風景',original:'オリジナル'
});
const LIMIT=12,DAILY_LIMIT=48,TTL=900;
const json=(x,status=200,extra={})=>new Response(JSON.stringify(x),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':status===200?'public, max-age=60, s-maxage=300':'no-store',
  'x-content-type-options':'nosniff',...extra}});
const GOOD_HOSTS=new Set(['i.pixiv.re','i.pixiv.cat','i-cf.pximg.net','i.pximg.net','i.pixiv.moe']);
function cleanURL(s){try{const u=new URL(s);return u.protocol==='https:'&&GOOD_HOSTS.has(u.hostname)?u.href:null;}catch{return null;}}
function str(s,n=110){return typeof s==='string'?s.slice(0,n):'';}
function normalize(item,provider){
  if(!item||typeof item!=='object'||item.r18===true||item.r18===1||item.r18==='1')return null;
  const pid=Number(item.pid),uid=Number(item.uid),p=Number(item.p||0);
  if(!Number.isSafeInteger(pid)||pid<=0)return null;
  if(item.aiType===2)return null;
  const urls=item.urls||{};
  const original=cleanURL(urls.original||item.url);
  const preview=cleanURL(urls.regular)||cleanURL(urls.small)||original;
  const thumb=cleanURL(urls.small)||cleanURL(urls.regular)||original;
  if(!thumb)return null;
  return {
    id:'pixiv:'+pid+':'+p,pid,page:p,provider,title:str(item.title)||'无标题',
    author:str(item.author)||'画师',uid:Number.isSafeInteger(uid)?uid:null,
    pixiv_url:'https://www.pixiv.net/artworks/'+pid,
    artist_url:Number.isSafeInteger(uid)&&uid>0?'https://www.pixiv.net/users/'+uid:null,
    width:Number(item.width)||null,height:Number(item.height)||null,
    tags:Array.isArray(item.tags)?item.tags.filter(t=>typeof t==='string').slice(0,16).map(t=>str(t,40)):[],
    thumbnail_url:thumb,preview_url:preview,original_url:original||preview,
    r18:false,external:true,license:'原作者保留版权'
  };
}
async function budget(env,provider){
  const day=new Date().toISOString().slice(0,10);
  const x=await env.DB.prepare("INSERT INTO pixiv_api_budget(provider,day,calls) VALUES(?,?,1) ON CONFLICT(provider,day) DO UPDATE SET calls=calls+1 WHERE calls<? RETURNING calls").bind(provider,day,DAILY_LIMIT).first();
  return Boolean(x);
}
async function remote(url){
  const response=await fetch(url,{headers:{accept:'application/json','user-agent':'KiraJump-PixivMetadataFeed/0.1 (non-commercial dev preview)'},signal:AbortSignal.timeout(9500)});
  if(!response.ok)throw Error('upstream_http_'+response.status);
  const t=await response.text();
  if(t.length>550000)throw Error('upstream_oversize');
  return JSON.parse(t);
}
async function providerFetch(env,provider,keyword){
  if(!await budget(env,provider))throw Error('daily_budget');
  if(provider==='lolicon'){
    const u=new URL('https://api.lolicon.app/setu/v2');
    u.searchParams.set('num',String(LIMIT));u.searchParams.set('r18','0');
    u.searchParams.set('excludeAI','true');u.searchParams.append('size','small');
    u.searchParams.append('size','regular');u.searchParams.append('size','original');
    if(keyword)u.searchParams.set('keyword',keyword);
    const data=await remote(u.href);
    if(data.error)throw Error('upstream_'+str(data.error,90));
    return Array.isArray(data.data)?data.data.map(x=>normalize(x,provider)).filter(Boolean):[];
  }
  const u=new URL('https://image.anosu.top/pixiv/json');
  u.searchParams.set('num',String(LIMIT));u.searchParams.set('r18','0');u.searchParams.set('size','regular');
  if(keyword)u.searchParams.set('keyword',keyword);
  const data=await remote(u.href);
  const list=Array.isArray(data)?data:Array.isArray(data.data)?data.data:[];
  return list.map(x=>normalize(x,provider)).filter(Boolean);
}
function cors(request){
  const origin=request.headers.get('origin');
  const allow=origin==='https://kira-cf.casto.top'||origin==='http://localhost:8787'||origin==='http://127.0.0.1:8787';
  return {'vary':'Origin',...(allow?{'access-control-allow-origin':origin,'access-control-allow-methods':'GET,HEAD,OPTIONS'}:{})};
}
export default {async fetch(request,env){
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,'')||'/';
  const corsHeaders=cors(request);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
  if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'method_not_allowed'},405,corsHeaders);
  if(path==='/health')return json({ok:true,service:'kira-free-pixiv-feed-dev',db:!!env.DB,r18:false,version:'0.1'},200,corsHeaders);
  if(path!=='/api/v1/pixiv')return json({error:'not_found'},404,corsHeaders);
  const channel=url.searchParams.get('channel')||'discover';
  if(!Object.hasOwn(CHANNELS,channel))return json({error:'unsupported_channel'},400,corsHeaders);
  const batch=Number(url.searchParams.get('batch')||0);
  if(!Number.isInteger(batch)||batch<0||batch>3)return json({error:'invalid_batch'},400,corsHeaders);
  const cacheURL=new URL(url.origin+'/api/v1/pixiv');
  cacheURL.searchParams.set('channel',channel);cacheURL.searchParams.set('batch',String(batch));
  const key=new Request(cacheURL.href);
  const hit=await caches.default.match(key);
  if(hit){const hdr=new Headers(hit.headers);for(const [k,v] of Object.entries(corsHeaders))hdr.set(k,v);hdr.set('x-kira-cache','HIT');return new Response(request.method==='HEAD'?null:hit.body,{status:hit.status,headers:hdr});}
  let items=[],provider=null,failures=[];
  for(const candidate of ['lolicon','anosu']){
    try{items=await providerFetch(env,candidate,CHANNELS[channel]);if(items.length){provider=candidate;break;}
      failures.push(candidate+':empty_results');
    }catch(e){failures.push(candidate+':'+str(e.message,80));}
  }
  if(!items.length)return json({error:'image_feed_unavailable',sources:failures,retry_after_seconds:300},503,{'retry-after':'300',...corsHeaders});
  const body=JSON.stringify({source:provider,channel,items,has_more:batch<3,generated_at:new Date().toISOString(),note:'仅外部 Pixiv 发现流；图片直接来自第三方服务，非自有作品。'});
  const response=new Response(body,{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age='+TTL}});
  await caches.default.put(key,response.clone());
  const h=new Headers(response.headers);for(const [k,v] of Object.entries(corsHeaders))h.set(k,v);
  h.set('x-kira-cache','MISS');
  return new Response(request.method==='HEAD'?null:response.body,{headers:h});
}};