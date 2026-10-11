/**
 * KIRA Pixiv feed — preverified, read-only JSON snapshot.
 * The build script injects PAGE and SNAPSHOT. No Pixiv API calls per visitor.
 */
const CHANNELS=new Set(['discover','miku','genshin','girl']);
function json(x,status=200){return new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff','cache-control':status===200?'public, max-age=300, s-maxage=1800':'no-store'}})}
export default {async fetch(request){
  const u=new URL(request.url);
  const p=u.pathname.replace(/\/$/,'')||'/';
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'allow':'GET,HEAD,OPTIONS'}});
  if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'method_not_allowed'},405);
  if(p==='/'||p==='/index.html')return new Response(request.method==='HEAD'?null:PAGE,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'public,max-age=300'}});
  if(p==='/health')return json({ok:true,service:'kira-pixiv-feed-dev',version:'0.3',source:'lolicon-snapshot',generated_at:SNAPSHOT.generated_at,channels:Object.fromEntries(Object.entries(SNAPSHOT.channels).map(([k,v])=>[k,v.length]))});
  if(p!=='/api/v1/pixiv')return json({error:'not_found'},404);
  const channel=u.searchParams.get('channel')||'discover';
  const batch=Number(u.searchParams.get('batch')||0);
  if(!CHANNELS.has(channel)||!Number.isInteger(batch)||batch<0||batch>3)return json({error:'invalid_query'},400);
  const arrays=channel==='discover'?['discover','miku','genshin','girl'].map(k=>SNAPSHOT.channels[k]||[]):[SNAPSHOT.channels[channel]||[]];
  const seen=new Set(),items=[];
  for(const a of arrays)for(const w of a){if(!w||seen.has(w.id)||w.r18!==false||(w.tags||[]).some(t=>/^(?:r[\s_-]*18(?:g)?|nsfw|explicit|adult|成人向|18禁)$/i.test(String(t).trim()))||!w.pixiv_url?.startsWith('https://www.pixiv.net/artworks/')||!w.thumbnail_url?.startsWith('https://'))continue;seen.add(w.id);items.push(w)}
  return json({source:'lolicon-snapshot',channel,items:items.slice(batch*12,(batch+1)*12),has_more:(batch+1)*12<items.length,generated_at:SNAPSHOT.generated_at,images:'third-party-host',r18:false});
}};