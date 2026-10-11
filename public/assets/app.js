'use strict';
/* KIRA! JUMP V6 — local-only interactions and verified Pixiv metadata; no telemetry. */
const $=id=>document.getElementById(id);
const ico=name=>`<svg aria-hidden="true"><use href="#ico-${name}"></use></svg>`;

/* KIRA! JUMP V6 — real Pixiv metadata snapshot; artwork remains owned by creators. */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const allowedImage=u=>{try{const v=new URL(u);return v.protocol==='https:'&&['i.pixiv.re','i.pixiv.cat','i.pximg.net','i-cf.pximg.net','i.pixiv.moe'].includes(v.hostname)?v.href:null}catch{return null}};
const SOURCE_TAGS={miku:'初音未来',genshin:'原神',girl:'少女',discover:'Pixiv'};
const DENY_TAG=/^(?:r[\s_-]*18(?:g)?|nsfw|explicit|成人向|adult|18禁)$/i;
const COMMON_TAG=/^(?:女の子|女孩子|girl|girls|オリジナル|原创|original|イラスト|illustration|pixiv|r[\s_-]*18(?:g)?)$/i;
function facet(w,tagSet){
  const has=re=>w.some(x=>re.test(x));
  const character=w.find(t=>/^(初音ミク|初音未来|刻晴|Keqing|甘雨|Ganyu|雷電将軍|Raiden Shogun|胡桃|Hu Tao|フリーナ|芙宁娜|ディシア|迪希雅|八重神子|宵宮|旅行者|钟离)$/i.test(t))||
    (has(/原神|Genshin/) ? '原神' : has(/初音/) ? '初音未来' : tagSet.has('miku')?'初音未来':tagSet.has('genshin')?'原神':'原创角色');
  const mood=has(/夜|night|夜景/i)?'夜景':has(/夏|水着|海|summer/i)?'夏日':has(/空|風景|景色|sky|landscape/i)?'风景':has(/魔法|ファンタジー|fantasy|魔女/i)?'幻想':has(/サイバー|cyber|近未来/i)?'赛博':has(/花|桜|樱|春/i)?'花季':'插画';
  const color=has(/青|蓝|蒼|蓝色|blue|cyan/i)?'蓝':has(/紫|violet|purple/i)?'紫':has(/桜|樱|粉|pink/i)?'粉':has(/赤|紅|红|red/i)?'红':has(/黄|金|gold|sun/i)?'金':has(/白|white|銀|银/i)?'白':has(/黒|黑|black/i)?'黑':'未分类';
  const kind=has(/オリジナル|原创|original/i)?'原创':'同人';
  return {character,mood,color,kind};
}
function normalizeSnapshot(snapshot){
  if(!snapshot?.channels||typeof snapshot.channels!=='object')return [];
  const records=new Map();
  const order=['discover','miku','genshin','girl'];
  for(const group of order)for(const a of (Array.isArray(snapshot.channels[group])?snapshot.channels[group]:[])){
    if(!a||a.r18!==false||!Number.isSafeInteger(a.pid)||!Array.isArray(a.tags))continue;
    const tags=a.tags.filter(t=>typeof t==='string').map(t=>t.slice(0,48));
    if(tags.some(t=>DENY_TAG.test(t)))continue;
    const card=allowedImage(a.thumbnail_url),preview=allowedImage(a.preview_url),original=allowedImage(a.original_url);
    if(!card||!preview||!original)continue;
    const id=a.pid*1000+Number(a.page||0);
    if(!Number.isSafeInteger(id)||id<=0)continue;
    if(records.has(id)){records.get(id)._groups.add(group);continue;}
    const tagSet=new Set([group]),facets=facet(tags,tagSet);
    records.set(id,{
      id,pid:a.pid,title:String(a.title||'无标题').slice(0,140),artist:String(a.author||'未知画师').slice(0,100),
      tags,facets,character:facets.character,mood:facets.mood,color:/^(蓝|紫|粉|红|金|绿|黑|白|灰|暖)$/.test(a.dominant_tone||'')?a.dominant_tone:facets.color,
      dominantHex:/^#[a-fA-F0-9]{6}$/.test(a.dominant_hex||'')?a.dominant_hex:null,
      artistKey:Number.isSafeInteger(a.uid)&&a.uid>0?'pixiv:'+a.uid:'name:'+String(a.author||'未知画师'),
      kinds:[facets.kind],likes:null,series:0,ratio:Math.max(.62,Math.min(2.35,Number(a.height)/Math.max(1,Number(a.width))||1.3)),
      desc:'来自 Pixiv 的外部作品 · 原作者保留版权，详情请查看 Pixiv 原作。',
      card,preview,original,pixivUrl:'https://www.pixiv.net/artworks/'+a.pid,
      artistUrl:Number.isSafeInteger(a.uid)&&a.uid>0?'https://www.pixiv.net/users/'+a.uid:null,
      _groups:tagSet
    });
  }
  for(const w of records.values()){
    w.kind=w.facets.kind;
    w.tags=[...new Set([...w.tags, ...[...w._groups].map(x=>SOURCE_TAGS[x]||'Pixiv')])];
    delete w._groups;
  }
  return [...records.values()];
}
let WORKS=[];
let pixivSnapshotDate=null;
function storedLikes(){try{const a=JSON.parse(localStorage.getItem('kira.likes.v2')||'[]');return Array.isArray(a)?a.filter(Number.isSafeInteger):[]}catch{return []}}
function storedFollows(){try{const a=JSON.parse(localStorage.getItem('kira.follows.v2')||'[]');return Array.isArray(a)?a.filter(x=>typeof x==='string'):[]}catch{return []}}

const state={refreshNonce:0,main:'推荐',route:'all',filter:'全部',search:'',shown:[],focus:null,anchor:null,relatedPath:'character',zoom:1,panX:0,panY:0,original:false,liked:new Set(storedLikes()),followed:new Set(storedFollows()),lastCard:null,moving:false};
const byId=id=>WORKS.find(w=>w.id===Number(id));
const prefersReduced=window.matchMedia('(prefers-reduced-motion: reduce)');
const count=n=>typeof n==='number'?(n>=10000?(n/10000).toFixed(1)+'万':String(n)):'PIXIV';
let toastTimer;
function toast(msg){const node=$('toast');node.textContent=msg;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),2200)}

function shared(a,b){const tags=new Set(a.tags.map(t=>t.toLowerCase()));return b.tags.reduce((n,t)=>n+(tags.has(t.toLowerCase())&&!COMMON_TAG.test(t)?1:0),0)}
function baseList(){
  let list=WORKS.slice();
  const seed=byId(state.anchor)||WORKS[0];
  if(state.route!=='all'&&seed){
    list=list.filter(w=>w.id!==seed.id&&relationScore(seed,w,state.route)>0)
      .sort((a,b)=>relationScore(seed,b,state.route)-relationScore(seed,a,state.route));
  }
  if(state.main==='精选')list.sort((a,b)=>b.tags.length-a.tags.length);
  if(state.main==='换一批'){
    const seed=state.refreshNonce||1;
    const hash=id=>{let x=(id^Math.imul(seed,2654435761))>>>0;x^=x>>>16;x=Math.imul(x,2246822519)>>>0;x^=x>>>13;return x>>>0};
    list.sort((a,b)=>hash(a.id)-hash(b.id));
  }
  if(state.main==='关注')list=list.filter(w=>state.followed.has(w.artistKey));
  if(state.filter!=='全部')list=list.filter(w=>w.kind===state.filter||w.tags.includes(state.filter)||w.mood===state.filter);
  const q=state.search.trim().toLowerCase();
  if(q)list=list.filter(w=>[w.title,w.artist,w.character,w.mood,w.color,...w.tags].join(' ').toLowerCase().includes(q));
  return list;
}


function card(w,i){
  return '<article class="art-card" style="--delay:'+Math.min(i,14)*26+'ms">'+
    '<button class="art-cover" data-view="'+w.id+'" aria-label="查看作品：'+esc(w.title)+'" style="--ratio:'+w.ratio+'">'+
    '<img src="'+esc(w.card)+'" data-card-art="'+w.id+'" referrerpolicy="no-referrer" alt="'+esc(w.title)+'" loading="'+(i<7?'eager':'lazy')+'" decoding="async">'+
    '<span class="art-cover-label">PIXIV</span><span class="art-peek">发现原作者 ↗</span></button>'+
    '<div class="art-copy"><div class="art-name" title="'+esc(w.title)+'">'+esc(w.title)+'</div>'+
    '<div class="art-meta"><span class="mini-face" style="background:'+colorFor(w)+'">'+esc(w.artist.slice(0,1))+'</span>'+
    '<span class="art-author">'+esc(w.artist)+'</span><span class="art-likes">✦ Pixiv</span></div>'+
    '<div class="art-tags"><span># '+esc(w.character)+'</span><span># '+esc(w.mood)+'</span></div></div></article>';
}

function colorFor(w){if(w.dominantHex)return w.dominantHex;return {蓝:'#6a91e9',紫:'#9876e9',粉:'#f879aa',金:'#e0a45f',红:'#eb7782',白:'#a9abd5',暖:'#d5a468'}[w.color]||'#7368b8'}

function draw(){
  const list=baseList();state.shown=list;
  $('feedCount').textContent='· '+list.length+' 张 Pixiv 作品';
  const seed=byId(state.anchor)||WORKS[0];
  const names={all:'全部发现',character:'角色同频',color:'色彩共振',mood:'氛围感应'};
  $('feedTitle').textContent=state.main==='推荐'?(state.route==='all'?'Pixiv 插画发现':names[state.route]+' · '+(seed?state.route==='character'?seed.character:state.route==='color'?seed.color:seed.mood:'')) :state.main==='精选'?'从标签中发现':state.main==='换一批'?'换个顺序看看':state.main==='关注'?'已关注的画师':'Pixiv 插画发现';
  const columns=window.innerWidth<=650?2:window.innerWidth<=850?3:4,cols=Array.from({length:columns},()=>[]),heights=Array(columns).fill(0);
  list.forEach((w,i)=>{const c=heights.indexOf(Math.min(...heights));cols[c].push(card(w,i));heights[c]+=w.ratio+.32});
  $('artWall').innerHTML=list.length?cols.map(a=>'<div class="art-col">'+a.join('')+'</div>').join('')
    :'<div class="empty-feed"><strong>'+(!WORKS.length?'正在连接 Pixiv 作品流…':'这里还没有对应作品 ✳')+'</strong>'+(!WORKS.length?'':state.main==='关注'?'打开作品详情关注画师，作品会出现在这里。':'试试其他标签或清除搜索。')+'</div>';
  // Thumbnail fallback is lazy, never load giant originals merely to populate the wall.
  document.querySelectorAll('[data-card-art]').forEach(img=>img.addEventListener('error',()=>{
    const w=byId(img.dataset.cardArt);
    if(!w)return;
    const attempt=img.dataset.fallback||'primary';
    if(attempt==='primary'){img.dataset.fallback='mirror';img.src=mirrorUrl(w.card,1)||w.preview;return}
    if(attempt==='mirror'){img.dataset.fallback='preview';img.src=w.preview;return}
    if(attempt==='preview'){img.dataset.fallback='preview-mirror';img.src=mirrorUrl(w.preview,1)||w.preview;return}
    img.style.opacity='.12';img.alt='外部图片源失效 · 点击可在阅图器重试';
  }));
  document.querySelectorAll('[data-route]').forEach(b=>b.classList.toggle('on',b.dataset.route===state.route));
  document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('on',b.dataset.filter===state.filter));
  document.querySelectorAll('[data-main]').forEach(b=>b.classList.toggle('active',b.dataset.main===state.main));
}
function renderRanks(){
  $('miniRank').innerHTML=WORKS.slice(0,4).map((w,i)=>'<button class="rank-item" data-rank="'+w.id+'"><span class="rank-no '+(i<3?'top':'')+'">'+(i+1)+'</span><img src="'+esc(w.card)+'" referrerpolicy="no-referrer" loading="lazy" alt=""><span><strong>'+esc(w.title)+'</strong><small>↗ '+esc(w.artist)+'</small></span></button>').join('');
}

function setRoute(route){state.route=route;state.main='推荐';state.filter='全部';state.search='';$('search').value='';draw();toast({all:'重新连接全部频道 ✦',character:'角色同频频道已连接 ⚡',color:'色彩共振频道已连接 ✦',mood:'氛围感应频道已连接 ✧'}[route]||'频道已切换')}
function setMain(main){if(main==='换一批')state.refreshNonce++;state.main=main;draw();window.scrollTo({top:0,behavior:'smooth'})}
function pickNew(){const ids=(state.shown.length?state.shown:WORKS).filter(w=>w.id!==state.focus?.id);const chosen=ids[Math.floor(Math.random()*ids.length)]||WORKS[0];if(!chosen){toast('作品正在加载中');return}openReader(chosen.id,null);toast('跃迁成功！发现了新的作品 ✳')}
function motionClone(fromEl,toEl,reverse=false){if(prefersReduced.matches||!fromEl||!toEl)return;const a=fromEl.getBoundingClientRect();const b=toEl.getBoundingClientRect();if(!a.width||!a.height||!b.width||!b.height)return;const clone=document.createElement('img');clone.src=fromEl.currentSrc||fromEl.src;clone.alt='';clone.style.cssText='position:fixed;z-index:125;object-fit:cover;pointer-events:none;box-shadow:0 25px 70px #08061770;will-change:top,left,width,height,border-radius;';document.body.append(clone);const first=reverse?b:a,last=reverse?a:b;const style=(r,rad)=>({top:r.top+'px',left:r.left+'px',width:r.width+'px',height:r.height+'px',borderRadius:rad});const anim=clone.animate([style(first,'12px'),style(last,'5px')],{duration:380,easing:'cubic-bezier(.2,.76,.17,1)',fill:'both'});anim.finished.catch(()=>{}).finally(()=>clone.remove())}

/* V7 image loading coordinator. An old async response must never overwrite a newer work. */
let mediaSequence=0;
let mediaPreloadSequence=0;
const warmImages=new Map();
function markMedia(kind,message='',detail=''){
 const load=$('mediaLoad'),fail=$('mediaFail');
 load.hidden=kind!=='loading';fail.hidden=kind!=='failed';
 if(kind==='loading'){$('mediaLoadTitle').textContent=message||'正在载入作品…';$('mediaLoadSub').textContent=detail||'已经保留图片浏览状态'}
 if(kind==='failed'){$('mediaLoadTitle').textContent='加载失败';}
}

/* Community image proxy failover: same Pixiv path, only change verified mirror host. */
const MIRRORS=['i.pixiv.re','i.pixiv.nl','i.pixiv.cat'];
function mirrorUrl(input,index=1){
 try{
  const u=new URL(input);
  if(u.protocol!=='https:'||!MIRRORS.includes(u.hostname))return null;
  u.hostname=MIRRORS[index]||MIRRORS[0];return u.toString();
 }catch{return null}
}
async function imageWithFailover(url,timeout=7000,refresh=false){
 const original=new URL(url);
 const tried=new Set();
 const candidates=[url,mirrorUrl(url,1),mirrorUrl(url,2)].filter(Boolean);
 let lastError=new Error('no_image_mirror');
 for(let i=0;i<candidates.length;i++){
  const candidate=candidates[i];
  if(tried.has(candidate))continue;tried.add(candidate);
  try{return await pictureRequest(candidate,i?5500:timeout,refresh&&i===0)}
  catch(error){lastError=error}
 }
 throw lastError;
}

function pictureRequest(url,timeout=8500,refresh=false){
 if(!url)return Promise.reject(new Error('invalid_source'));
 if(!refresh&&warmImages.has(url))return warmImages.get(url);
 const p=new Promise((resolve,reject)=>{
  const img=new Image();img.referrerPolicy='no-referrer';img.decoding='async';
  let done=false;const finish=(error)=>{
   if(done)return;done=true;clearTimeout(timer);img.onload=img.onerror=null;
   if(error){try{img.src=''}catch{}reject(new Error(error))}else resolve({url:img.currentSrc||img.src,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,img});
  };
  img.onload=()=>{if(img.naturalWidth>0&&img.naturalHeight>0)finish(null);else finish('empty_image')};
  img.onerror=()=>finish('image_failed');
  const timer=setTimeout(()=>finish('image_timeout'),timeout);
  img.src=refresh?(url+(url.includes('?')?'&':'?')+'kira_refresh='+Date.now()):url;
 });
 if(!refresh){
  warmImages.set(url,p);
  p.catch(()=>{if(warmImages.get(url)===p)warmImages.delete(url)});
  if(warmImages.size>48)warmImages.delete(warmImages.keys().next().value);
 }
 return p;
}
function fitMedia(nw,nh){
 const stage=$('readerStage'),image=$('viewerImage');
 if(!nw||!nh||!stage.clientWidth||!stage.clientHeight)return;
 const mobile=innerWidth<=650,marginX=mobile?34:100,marginY=mobile?132:120;
 const stageW=Math.max(80,stage.clientWidth-marginX),stageH=Math.max(90,stage.clientHeight-marginY);
 const ratio=Math.min(stageW/nw,stageH/nh);
 const width=Math.max(1,Math.floor(nw*ratio)),height=Math.max(1,Math.floor(nh*ratio));
 image.style.width=width+'px';image.style.height=height+'px';
 image.dataset.baseWidth=String(width);image.dataset.baseHeight=String(height);
}
function setVisibleImage(candidate){
 const im=$('viewerImage');
 im.referrerPolicy='no-referrer';
 im.src=candidate.url;
 im.dataset.naturalWidth=String(candidate.naturalWidth);
 im.dataset.naturalHeight=String(candidate.naturalHeight);
 fitMedia(candidate.naturalWidth,candidate.naturalHeight);
 im.classList.add('loaded');
 im.style.opacity='';
 // If the browser refuses to paint the preloaded URL, make the failure obvious.
 im.onerror=()=>{if(state.focus){im.classList.remove('loaded');markMedia('failed');}};
}
async function loadWorkPreview(w,{force=false,source=null}={}){
 const seq=++mediaSequence;
 const im=$('viewerImage');
 im.classList.remove('loaded');im.style.opacity='';
 markMedia('loading',force?'正在刷新这张图…':'正在载入 '+w.title,'优先预览图 · 不自动下载巨大原图');
 const candidates=force?[{url:w.preview,refresh:true},{url:w.preview,refresh:false},{url:w.card,refresh:false}]:
 [{url:w.preview,refresh:false},{url:w.card,refresh:false}];
 try{
  let chosen=null;let isThumb=false;
  for(const c of candidates){
   try{chosen=await imageWithFailover(c.url,c.url===w.card?4800:6600,c.refresh);isThumb=c.url===w.card;break}catch(error){console.warn('KIRA image retry',error.message);}
   if(seq!==mediaSequence||state.focus?.id!==w.id)return;
  }
  if(seq!==mediaSequence||state.focus?.id!==w.id)return;
  if(!chosen){im.removeAttribute('src');im.classList.remove('loaded');markMedia('failed');return;}
  setVisibleImage(chosen);markMedia('idle');state.original=false;
  $('btnOriginal').disabled=false;$('btnOriginal').classList.remove('on');$('btnOriginal').querySelector('span').textContent='查看原图';
  resetZoom(false);
  if(isThumb)alertOriginal('大图加载失败，已显示缩略图；点击刷新可以重试高清');
  if(source&&!prefersReduced.matches){
    const image=source.querySelector('img');
    if(image&&image.complete&&image.naturalWidth)requestAnimationFrame(()=>motionClone(image,im));
  }else if(!prefersReduced.matches){
    im.animate([{opacity:.15,filter:'blur(7px)'},{opacity:1,filter:'blur(0px)'}],{duration:230,easing:'ease-out'});
  }
  prefetchNeighbors(w);
 }catch(error){if(seq===mediaSequence){im.removeAttribute('src');im.classList.remove('loaded');markMedia('failed');}}
}
function prefetchNeighbors(w){
 const seq=++mediaPreloadSequence,arr=state.shown.length?state.shown:WORKS;
 const i=arr.findIndex(x=>x.id===w.id);
 if(i<0)return;
 // At most two small/regular previews: never auto-prefetch external originals.
 for(const next of [arr[(i+1)%arr.length],arr[(i+2)%arr.length]].filter(Boolean)){
  if(seq!==mediaPreloadSequence)break;
  pictureRequest(next.preview,6500).catch(()=>{});
 }
}
function openReader(id,source){
 const w=byId(id);if(!w)return;
 const wasOpen=$('reader').classList.contains('open');
 const sourceImg=source?.querySelector('img')||null;
 state.anchor=w.id;
 if(!wasOpen)state.lastCard=source||null;
 state.focus=w;state.original=false;state.relatedPath='character';
 try{if(location.hash!=='#art-'+w.id)history.replaceState(history.state,'','#art-'+w.id)}catch{}
 $('reader').classList.add('open');$('reader').setAttribute('aria-hidden','false');
 document.body.style.overflow='hidden';
 resetZoom(false);
 fillReader(); // details update to the target work before async image loading.
 loadWorkPreview(w,{source:sourceImg?source:null});
 if(!wasOpen&&!prefersReduced.matches){$('reader').animate([{opacity:.5},{opacity:1}],{duration:170,easing:'ease-out'})}
}
function closeReader(){
 if(!$('reader').classList.contains('open'))return;
 ++mediaSequence;++mediaPreloadSequence;
 const focused=state.focus;
 const start=$('viewerImage');
 const card=state.lastCard&&document.body.contains(state.lastCard)?state.lastCard.querySelector('img'):document.querySelector('[data-view="'+(focused?.id||'')+'"] img');
 if(card&&start.classList.contains('loaded')&&card.getBoundingClientRect().top<innerHeight&&card.getBoundingClientRect().bottom>0)motionClone(card,start,true);
 $('reader').classList.remove('open');$('reader').setAttribute('aria-hidden','true');
 document.body.style.overflow='';markMedia('idle');resetZoom(false);state.focus=null;
 if(location.hash.startsWith('#art-'))try{history.replaceState(history.state,'',location.pathname+location.search)}catch{}
}


/* Conservative, explainable facets. Never pad a recommendation category with unrelated art. */
function relationScore(source,candidate,axis){
 if(source.id===candidate.id)return 0;
 const overlap=shared(source,candidate);
 const generic=new Set(['原创角色','插画','未分类']);
 if(axis==='character'){
  if(!generic.has(source.character)&&candidate.character===source.character)return 110+overlap*9;
  // Fallback to genuinely shared named character, copyright/IP or uncommon tag.
  if(overlap>=2)return overlap*12;
  if(overlap===1&&source.kind==='同人'&&candidate.kind==='同人')return 12;
  return 0;
 }
 if(axis==='color'){
  if(!source.dominantHex||!candidate.dominantHex)return 0;
  const parts=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
  const a=parts(source.dominantHex),b=parts(candidate.dominantHex);
  const dist=Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const sameTone=source.color===candidate.color;
  if(!sameTone&&dist>96)return 0;
  return Math.round((sameTone?90:35)+Math.max(0,100-dist)+overlap*4);
 }
 if(axis==='mood'){
  if(!generic.has(source.mood)&&source.mood===candidate.mood)return 100+overlap*7;
  const moodTags=/夜|night|夏|summer|空|sky|風景|景色|landscape|魔法|fantasy|海|sea|花|桜|春|cyber|赛博|水着|樱|夕焼け|sunset/i;
  const same=(source.tags||[]).filter(t=>moodTags.test(t)).some(t=>(candidate.tags||[]).includes(t));
  return same?55+overlap*7:0;
 }
 return 0;
}
function related(w,path){
 return WORKS.filter(x=>x.id!==w.id).map(x=>({work:x,score:relationScore(w,x,path)}))
 .filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.work.id-b.work.id).slice(0,12).map(x=>x.work);
}
function relatedDraw(){
 const w=state.focus;if(!w)return;
 document.querySelectorAll('[data-path]').forEach(b=>b.classList.toggle('on',b.dataset.path===state.relatedPath));
 const list=related(w,state.relatedPath),axisLabel={character:'角色',color:'色彩',mood:'氛围'}[state.relatedPath]||'同频';
 const container=$('relatedWorks');
 container.innerHTML=list.map(x=>
  '<button class="related-item" data-related="'+x.id+'" aria-label="查看相关作品：'+esc(x.title)+'">'+
  '<img src="'+esc(x.card)+'" referrerpolicy="no-referrer" alt="" loading="lazy">'+
  '<span>'+esc(x.title)+'<small class="related-reason">'+esc(state.relatedPath==='character'?x.character:state.relatedPath==='color'?x.color+'色调':x.mood)+'</small></span></button>'
 ).join('');
 let desc=$('relatedCount');
 if(!desc){desc=document.createElement('p');desc.id='relatedCount';desc.className='reader-related-count';container.before(desc)}
 desc.textContent=list.length?'严格匹配 '+list.length+' 张'+axisLabel+'相关作品 · 按关联度排序':'当前作品没有足够的'+axisLabel+'匹配项 · 试试其他跃迁频道';
 if(!list.length)container.innerHTML='<p class="reader-related-count">本批作品暂无可靠关联，不以无关图片填充。</p>';
}
function fillReader(){
 const w=state.focus;if(!w)return;
 $('readerCrumb').textContent=w.title;
 $('readerTitle').textContent=w.title;
 $('readerKind').textContent='PIXIV / '+(w.kind==='原创'?'ORIGINAL':'FAN ART');
 $('artistName').textContent=w.artist;
 $('artistFace').textContent=w.artist.slice(0,1);
 $('artistFace').style.background=colorFor(w);
 document.querySelector('.artist-info small').textContent='PIXIV · 原作者保留版权';
 $('readerDesc').textContent=w.desc;
 const tags=[w.character,w.mood,w.color+'系',...w.tags].filter((x,i,a)=>x&&a.indexOf(x)===i).slice(0,15);
 $('readerTags').innerHTML=tags.map(tag=>'<button data-term="'+esc(tag)+'"># '+esc(tag)+'</button>').join('');
 $('favArt').classList.toggle('faved',state.liked.has(w.id));
 $('favArt').querySelector('span').textContent=state.liked.has(w.id)?'已收藏':'收藏作品';
 $('followArtist').textContent=state.followed.has(w.artistKey)?'✓ 已关注':'＋ 关注';
 if($('pixivSource'))$('pixivSource').href=w.pixivUrl;
 $('btnOriginal').disabled=false;$('btnOriginal').classList.remove('on');
 $('btnOriginal').querySelector('span').textContent='查看原图';
 const shown=state.shown.length?state.shown:WORKS,i=shown.findIndex(x=>x.id===w.id);
 $('stageCounter').textContent=String(i+1||1).padStart(2,'0')+' / '+String(shown.length).padStart(2,'0');
 relatedDraw();
}

function swapArt(direction){const arr=state.shown.length?state.shown:WORKS;const idx=arr.findIndex(w=>w.id===state.focus?.id);const next=arr[(idx+direction+arr.length)%arr.length];if(next)openReader(next.id,null)}

/* Unlocked, image-only zoom: X and Y can be adjusted independently. */
function resetZoom(animate=true){
 state.zoomX=1;state.zoomY=1;state.zoom=1;state.panX=0;state.panY=0;applyZoom(animate);
}
function clampPan(){
 const img=$('viewerImage'),stage=$('readerStage');
 const w=(Number(img.dataset.baseWidth)||img.offsetWidth)*state.zoomX;
 const h=(Number(img.dataset.baseHeight)||img.offsetHeight)*state.zoomY;
 const maxX=Math.max(0,(w-stage.clientWidth)/2+24);
 const maxY=Math.max(0,(h-stage.clientHeight)/2+24);
 state.panX=Math.min(maxX,Math.max(-maxX,state.panX));
 state.panY=Math.min(maxY,Math.max(-maxY,state.panY));
}
function applyZoom(animate=true){
 const image=$('viewerImage');
 if(!animate)image.classList.add('dragging');else image.classList.remove('dragging');
 state.zoomX=Math.min(5,Math.max(1,Number(state.zoomX)||1));
 state.zoomY=Math.min(5,Math.max(1,Number(state.zoomY)||1));
 state.zoom=Math.max(state.zoomX,state.zoomY);
 clampPan();
 image.style.setProperty('--zoom-x',state.zoomX);
 image.style.setProperty('--zoom-y',state.zoomY);
 image.style.setProperty('--pan-x',state.panX+'px');
 image.style.setProperty('--pan-y',state.panY+'px');
 $('zoomValue').textContent='宽'+Math.round(state.zoomX*100)+'% × 高'+Math.round(state.zoomY*100)+'%';
 $('zoomX').value=String(state.zoomX);$('zoomY').value=String(state.zoomY);
 $('readerStage').classList.toggle('canpan',state.zoom>1.01);
 if(!animate)requestAnimationFrame(()=>image.classList.remove('dragging'));
}
function changeZoom(next,axis='both'){
 const n=Math.min(5,Math.max(1,Math.round(next*100)/100));
 if(axis==='both'){state.zoomX=n;state.zoomY=n}
 else if(axis==='x')state.zoomX=n;
 else if(axis==='y')state.zoomY=n;
 if(Math.max(state.zoomX,state.zoomY)<=1.001)state.panX=state.panY=0;
 applyZoom();
}
function changeAxis(delta,axis){
 const current=axis==='x'?state.zoomX:state.zoomY;
 changeZoom(current+delta,axis);
}

function alertOriginal(text){const a=$('originalAlert');a.textContent=text;a.classList.add('show');clearTimeout(window._originalAlertTimer);window._originalAlertTimer=setTimeout(()=>a.classList.remove('show'),2400)}


let originalRequestSequence=0;
async function toggleOriginal(){
 const w=state.focus;if(!w)return;
 const next=!state.original,target=next?w.original:w.preview,seq=++originalRequestSequence,viewSeq=mediaSequence;
 if(!target||target===w.preview&&next){
   alertOriginal('第三方接口没有提供比当前预览更高清的资源');return;
 }
 $('btnOriginal').disabled=true;
 $('btnOriginal').querySelector('span').textContent=next?'原图读取中…':'返回预览中…';
 // The displayed image never disappears while the large original transfers.
 markMedia('loading',next?'原图正在传输…':'切换预览尺寸…','保留当前图片，下载完成后无缝替换');
 try{
  const candidate=await imageWithFailover(target,next?9800:7500);
  if(seq!==originalRequestSequence||viewSeq!==mediaSequence||state.focus?.id!==w.id)return;
  setVisibleImage(candidate);markMedia('idle');
  state.original=next;resetZoom();
  $('btnOriginal').classList.toggle('on',next);
  $('btnOriginal').querySelector('span').textContent=next?'已查看原图':'查看原图';
  alertOriginal(next?'原图已加载 · 可以独立调整宽高':'已切回轻量预览');
 }catch(error){
  if(seq!==originalRequestSequence||viewSeq!==mediaSequence||state.focus?.id!==w.id)return;
  markMedia('idle');
  $('btnOriginal').querySelector('span').textContent=next?'重试原图':'查看原图';
  alertOriginal('原图源响应过慢或失败，已保留当前图片 · 可重试');
 }finally{
  if(seq===originalRequestSequence&&viewSeq===mediaSequence)$('btnOriginal').disabled=false;
 }
}

function saveArtwork(){if(state.focus)alertOriginal('可以长按或右键图片保存；本站不代理跨域原图文件');}

function clickFromWall(e){const v=e.target.closest('[data-view]');if(v)openReader(v.dataset.view,v)}
$('artWall').addEventListener('click',clickFromWall);
$('miniRank').addEventListener('click',e=>{const b=e.target.closest('[data-rank]');if(b)openReader(b.dataset.rank,null)});
$('jumpchoices').addEventListener('click',e=>{const b=e.target.closest('[data-route]');if(b)setRoute(b.dataset.route)});
$('feedFilters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(b){state.filter=b.dataset.filter;draw()}});
$('search').addEventListener('input',e=>{state.search=e.target.value;draw()});
document.querySelectorAll('[data-main]').forEach(b=>b.addEventListener('click',()=>setMain(b.dataset.main)));
$('home').onclick=e=>{e.preventDefault();setRoute('all');window.scrollTo({top:0,behavior:'smooth'})};
$('surprise').onclick=pickNew;$('jumpNow').onclick=pickNew;$('sideJump').onclick=()=>setRoute('character');$('upload').onclick=()=>toast('投稿服务将由 Workers API + 审核流程接入，当前仅为 UI 演示');
document.querySelectorAll('[data-rail]').forEach(b=>b.onclick=()=>{const type=b.dataset.rail;if(type==='jump')pickNew();else if(type==='rank')setMain('精选');else if(type==='follow')setMain('关注');else setMain('推荐')});
document.querySelectorAll('[data-mobile]').forEach(b=>b.onclick=()=>{const type=b.dataset.mobile;if(type==='jump')pickNew();else if(type==='rank')setMain('热门');else if(type==='follow')setMain('关注');else if(type==='upload')toast('这里会是账户 / 投稿页面');else setMain('推荐')});
$('closeReader').onclick=closeReader;$('btnCloseIcon').onclick=closeReader;$('prevArt').onclick=()=>swapArt(-1);$('nextArt').onclick=()=>swapArt(1);
$('zoomIn').onclick=()=>changeZoom(state.zoom+.25);$('zoomOut').onclick=()=>changeZoom(state.zoom-.25);$('zoomReset').onclick=()=>resetZoom();$('btnFit').onclick=()=>resetZoom();$('btnOriginal').onclick=toggleOriginal;
$('zoomX').addEventListener('input',e=>changeZoom(+e.target.value,'x'));
$('zoomY').addEventListener('input',e=>changeZoom(+e.target.value,'y'));
$('retryImage').onclick=()=>{if(state.focus)loadWorkPreview(state.focus,{force:true})};
$('mediaRetry').onclick=()=>{if(state.focus)loadWorkPreview(state.focus,{force:true})};
$('viewerImage').addEventListener('dblclick',()=>resetZoom());
$('viewerImage').addEventListener('click',e=>{if(state.moving)return;changeZoom(state.zoom===1?1.8:1)});
$('favArt').onclick=()=>{const w=state.focus;if(!w)return;if(state.liked.has(w.id)){state.liked.delete(w.id);toast('已取消收藏')}else{state.liked.add(w.id);toast('已收藏这张作品 ♡')}try{localStorage.setItem('kira.likes.v2',JSON.stringify([...state.liked]))}catch{};fillFav()};
function fillFav(){const active=state.liked.has(state.focus.id);$('favArt').classList.toggle('faved',active);$('favArt').querySelector('span').textContent=active?'已收藏':'收藏作品'}
$('followArtist').onclick=()=>{const w=state.focus;if(!w)return;if(state.followed.has(w.artistKey)){state.followed.delete(w.artistKey);toast('已取消关注 '+w.artist)}else{state.followed.add(w.artistKey);toast('已关注画师 '+w.artist)}try{localStorage.setItem('kira.follows.v2',JSON.stringify([...state.followed]))}catch{}$('followArtist').textContent=state.followed.has(w.artistKey)?'✓ 已关注':'＋ 关注';if(state.main==='关注')draw()};
$('copyArt').onclick=async()=>{const w=state.focus;const u=new URL(window.location.href);u.hash='art-'+w.id;try{await navigator.clipboard.writeText(u.href);toast('已复制 KIRA 作品链接')}catch{toast('Pixiv 编号：'+w.pid)}};
$('saveOriginal').onclick=saveArtwork;
$('readerTags').addEventListener('click',e=>{const b=e.target.closest('[data-term]');if(!b)return;const term=b.dataset.term;closeReader();state.search=term;state.filter='全部';state.route='all';state.main='推荐';$('search').value=term;draw();window.scrollTo({top:0,behavior:'smooth'})});
$('reader').addEventListener('click',e=>{const path=e.target.closest('[data-path]');const suggestion=e.target.closest('[data-related]');if(path){state.relatedPath=path.dataset.path;relatedDraw()}else if(suggestion){openReader(suggestion.dataset.related,null)}});
window.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(state.focus)closeReader();$('search').focus();return}if(!state.focus)return;if(e.key==='Escape')closeReader();else if(e.key==='ArrowRight')swapArt(1);else if(e.key==='ArrowLeft')swapArt(-1);else if(e.key==='+'||e.key==='=')changeZoom(state.zoom+.25);else if(e.key==='-'||e.key==='_')changeZoom(state.zoom-.25);else if(e.key==='0')resetZoom()});
$('readerStage').addEventListener('wheel',e=>{if(!state.focus)return;e.preventDefault();const axis=e.shiftKey?'x':e.altKey?'y':'both';const n=axis==='x'?state.zoomX:axis==='y'?state.zoomY:state.zoom;changeZoom(n+(e.deltaY<0?.15:-.15),axis)},{passive:false});
// Pointer Events support mouse dragging, swipe-to-next and pinch-to-zoom on mobile.

const pointers=new Map();let anchor=null,pinchDistance=0,pinchX=0,pinchY=0,pinchStartX=1,pinchStartY=1;
function distance(){const v=[...pointers.values()];return Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y)}
$('readerStage').addEventListener('pointerdown',e=>{
 if(e.target.closest('button,input,label')||!state.focus)return;
 state.moving=false;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===1)anchor={x:e.clientX,y:e.clientY,panX:state.panX,panY:state.panY};
 if(pointers.size===2){const p=[...pointers.values()];pinchDistance=distance();pinchX=Math.abs(p[0].x-p[1].x);pinchY=Math.abs(p[0].y-p[1].y);pinchStartX=state.zoomX;pinchStartY=state.zoomY;anchor=null}
 try{$('readerStage').setPointerCapture(e.pointerId)}catch{}
});
$('readerStage').addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId))return;
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===2){
  const p=[...pointers.values()],scale=distance()/Math.max(1,pinchDistance);
  const dx=Math.abs(p[0].x-p[1].x),dy=Math.abs(p[0].y-p[1].y);
  state.zoomX=Math.min(5,Math.max(1,pinchStartX*(pinchX>24?dx/pinchX:scale)));
  state.zoomY=Math.min(5,Math.max(1,pinchStartY*(pinchY>24?dy/pinchY:scale)));
  applyZoom(false);state.moving=true;return;
 }
 if(!anchor)return;
 const dx=e.clientX-anchor.x,dy=e.clientY-anchor.y;
 if(Math.abs(dx)+Math.abs(dy)>8)state.moving=true;
 if(state.zoom>1.01){state.panX=anchor.panX+dx;state.panY=anchor.panY+dy;applyZoom(false)}
});
function pointerEnd(e){
 if(!pointers.has(e.pointerId))return;
 const dx=anchor?e.clientX-anchor.x:0;
 pointers.delete(e.pointerId);
 if(pointers.size===0){
  if(state.zoom<=1.01&&Math.abs(dx)>85&&state.moving)swapArt(dx<0?1:-1);
  if(state.zoom<1.02)resetZoom(false);
  anchor=null;setTimeout(()=>state.moving=false,60);
 }else if(pointers.size===1){const p=[...pointers.values()][0];anchor={x:p.x,y:p.y,panX:state.panX,panY:state.panY}}
}
$('readerStage').addEventListener('pointerup',pointerEnd);
$('readerStage').addEventListener('pointercancel',pointerEnd);

let prevCols=innerWidth<=650?2:innerWidth<=850?3:4;window.addEventListener('resize',()=>{const n=innerWidth<=650?2:innerWidth<=850?3:4;if(n!==prevCols){prevCols=n;draw()}if(state.focus&&$('viewerImage').classList.contains('loaded'))fitMedia(+$('viewerImage').dataset.naturalWidth,+$('viewerImage').dataset.naturalHeight);});

renderRanks();draw();
async function hydrateRealPixiv(){
 try{
  const response=await fetch('/assets/pixiv-feed.json?v=6.2',{cache:'force-cache'});
  if(!response.ok)throw Error('status '+response.status);
  const snap=await response.json(),works=normalizeSnapshot(snap);
  if(!works.length)throw Error('没有通过校验的 Pixiv 作品');
  WORKS=works;pixivSnapshotDate=snap.generated_at||null;state.anchor=WORKS[0].id;
  renderRanks();draw();
  const foot=document.querySelector('.foot-note span');
  if(foot)foot.textContent='PIXIV / '+WORKS.length+' VERIFIED METADATA / EXTERNAL MEDIA';
  const pulse=document.querySelector('.pulse-right');
  if(pulse)pulse.textContent='PIXIV / '+WORKS.length+' ARTS · EXTERNAL SOURCE';
  if(/^#art-\d+$/.test(location.hash)){const w=byId(Number(location.hash.slice(5)));if(w)openReader(w.id,null);}
 }catch(error){
  console.error('Pixiv metadata snapshot unavailable',error);
  $('feedTitle').textContent='Pixiv 作品源暂不可用';
  $('artWall').innerHTML='<div class="empty-feed"><strong>图片源暂时无法连接</strong>刷新页面再试。不会用假图冒充真实作品。</div>';
  $('feedCount').textContent='· 0 张';
  $('miniRank').textContent='等待图片源恢复';
 }
}
hydrateRealPixiv();
