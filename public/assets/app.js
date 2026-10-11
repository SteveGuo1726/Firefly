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

const state={main:'推荐',route:'all',filter:'全部',search:'',shown:[],focus:null,anchor:null,relatedPath:'character',zoom:1,panX:0,panY:0,original:false,liked:new Set(storedLikes()),followed:new Set(storedFollows()),lastCard:null,moving:false};
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
    const route=state.route;
    const score=w=> route==='character'?(w.character===seed.character?100:0)+shared(w,seed)*12
     :route==='color'?(seed.color!=='未分类'&&w.color===seed.color?100:0)+shared(w,seed)*6
     :(w.mood===seed.mood?100:0)+shared(w,seed)*6;
    list.sort((a,b)=>score(b)-score(a));
  }
  if(state.main==='精选')list.sort((a,b)=>b.tags.length-a.tags.length);
  if(state.main==='换一批')list.reverse();
  if(state.main==='关注')list=list.filter(w=>state.followed.has(w.artistKey));
  if(state.filter!=='全部')list=list.filter(w=>w.kind===state.filter||w.tags.includes(state.filter)||w.mood===state.filter);
  const q=state.search.trim().toLowerCase();
  if(q)list=list.filter(w=>[w.title,w.artist,w.character,w.mood,w.color,...w.tags].join(' ').toLowerCase().includes(q));
  return list;
}


function card(w,i){
  return '<article class="art-card" style="--delay:'+Math.min(i,14)*26+'ms">'+
    '<button class="art-cover" data-view="'+w.id+'" aria-label="查看作品：'+esc(w.title)+'" style="--ratio:'+w.ratio+'">'+
    '<img src="'+esc(w.card)+'" referrerpolicy="no-referrer" alt="'+esc(w.title)+'" loading="'+(i<7?'eager':'lazy')+'" decoding="async">'+
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
  document.querySelectorAll('[data-route]').forEach(b=>b.classList.toggle('on',b.dataset.route===state.route));
  document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('on',b.dataset.filter===state.filter));
  document.querySelectorAll('[data-main]').forEach(b=>b.classList.toggle('active',b.dataset.main===state.main));
}
function renderRanks(){
  $('miniRank').innerHTML=WORKS.slice(0,4).map((w,i)=>'<button class="rank-item" data-rank="'+w.id+'"><span class="rank-no '+(i<3?'top':'')+'">'+(i+1)+'</span><img src="'+esc(w.card)+'" referrerpolicy="no-referrer" loading="lazy" alt=""><span><strong>'+esc(w.title)+'</strong><small>↗ '+esc(w.artist)+'</small></span></button>').join('');
}

function setRoute(route){state.route=route;state.main='推荐';state.filter='全部';state.search='';$('search').value='';draw();toast({all:'重新连接全部频道 ✦',character:'角色同频频道已连接 ⚡',color:'色彩共振频道已连接 ✦',mood:'氛围感应频道已连接 ✧'}[route]||'频道已切换')}
function setMain(main){state.main=main;draw();window.scrollTo({top:0,behavior:'smooth'})}
function pickNew(){const ids=(state.shown.length?state.shown:WORKS).filter(w=>w.id!==state.focus?.id);const chosen=ids[Math.floor(Math.random()*ids.length)]||WORKS[0];if(!chosen){toast('作品正在加载中');return}openReader(chosen.id,null);toast('跃迁成功！发现了新的作品 ✳')}
function motionClone(fromEl,toEl,reverse=false){if(prefersReduced.matches||!fromEl||!toEl)return;const a=fromEl.getBoundingClientRect();const b=toEl.getBoundingClientRect();if(!a.width||!a.height||!b.width||!b.height)return;const clone=document.createElement('img');clone.src=fromEl.currentSrc||fromEl.src;clone.alt='';clone.style.cssText='position:fixed;z-index:125;object-fit:cover;pointer-events:none;box-shadow:0 25px 70px #08061770;will-change:top,left,width,height,border-radius;';document.body.append(clone);const first=reverse?b:a,last=reverse?a:b;const style=(r,rad)=>({top:r.top+'px',left:r.left+'px',width:r.width+'px',height:r.height+'px',borderRadius:rad});const anim=clone.animate([style(first,'12px'),style(last,'5px')],{duration:380,easing:'cubic-bezier(.2,.76,.17,1)',fill:'both'});anim.finished.catch(()=>{}).finally(()=>clone.remove())}
function openReader(id,source){const w=byId(id);if(!w)return;const wasOpen=$('reader').classList.contains('open');state.anchor=w.id;const sourceImg=source?.querySelector('img')||null;state.lastCard=source||null;state.focus=w;if(location.hash!=='#art-'+w.id)try{history.replaceState(history.state,'','#art-'+w.id)}catch{};state.original=false;state.relatedPath='character';resetZoom(false);$('reader').classList.add('open');$('reader').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';fillReader();if(!wasOpen&&sourceImg){$('viewerImage').style.opacity='0';const show=()=>{requestAnimationFrame(()=>{requestAnimationFrame(()=>{motionClone(sourceImg,$('viewerImage'));setTimeout(()=>$('viewerImage').style.opacity='',250)})})};if($('viewerImage').complete)show();else $('viewerImage').addEventListener('load',show,{once:true})}else{$('viewerImage').style.opacity='';if(wasOpen){$('viewerImage').animate([{opacity:.25,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,easing:'ease-out'})}}}
function closeReader(){if(!$('reader').classList.contains('open'))return;const start=$('viewerImage');const card=state.lastCard&&document.body.contains(state.lastCard)?state.lastCard.querySelector('img'):document.querySelector(`[data-view="${state.focus.id}"] img`);if(card&&card.getBoundingClientRect().top<innerHeight&&card.getBoundingClientRect().bottom>0)motionClone(card,start,true);$('reader').classList.remove('open');$('reader').setAttribute('aria-hidden','true');document.body.style.overflow='';resetZoom(false);state.focus=null;if(location.hash.startsWith('#art-'))try{history.replaceState(history.state,'',location.pathname+location.search)}catch{};}

function related(w,path){
 const score=x=>{const overlap=shared(x,w);
   if(path==='character')return (w.character!=='原创角色'&&x.character===w.character?10:0)+overlap*3+(x.kind===w.kind?1:0);
   if(path==='color')return (w.color!=='未分类'&&x.color===w.color?12:0)+overlap*2;
   return (w.mood!=='插画'&&x.mood===w.mood?10:0)+overlap*2;};
 return WORKS.filter(x=>x.id!==w.id).sort((a,b)=>score(b)-score(a)).slice(0,4);
}
function relatedDraw(){
 const w=state.focus;if(!w)return;
 document.querySelectorAll('[data-path]').forEach(b=>b.classList.toggle('on',b.dataset.path===state.relatedPath));
 $('relatedWorks').innerHTML=related(w,state.relatedPath).map(x=>
 '<button class="related-item" data-related="'+x.id+'" aria-label="前往 '+esc(x.title)+'">'+
 '<img src="'+esc(x.card)+'" referrerpolicy="no-referrer" alt="" loading="lazy"><span>'+esc(x.title)+'</span></button>').join('');
}
function fillReader(){
 const w=state.focus;if(!w)return;
 const image=$('viewerImage');image.referrerPolicy='no-referrer';
 image.onerror=()=>{image.style.opacity='1';alertOriginal('第三方图片暂时无法加载，可查看 Pixiv 原作');};
 image.src=w.preview;image.alt=w.title;
 $('ambient').style.backgroundImage='url("'+w.card+'")';
 $('readerCrumb').textContent=w.title;$('readerTitle').textContent=w.title;
 $('readerKind').textContent='PIXIV / EXTERNAL ARTWORK';
 $('artistName').textContent=w.artist;$('artistFace').textContent=w.artist.slice(0,1);
 $('artistFace').style.background=colorFor(w);
 document.querySelector('.artist-info small').textContent='PIXIV · 原作者保留版权';
 $('readerDesc').textContent=w.desc;
 const ordered=[w.character,w.mood,...w.tags].filter((x,i,a)=>x&&a.indexOf(x)===i).slice(0,14);
 $('readerTags').innerHTML=ordered.map(tag=>'<button data-term="'+esc(tag)+'"># '+esc(tag)+'</button>').join('');
 $('favArt').classList.toggle('faved',state.liked.has(w.id));
 $('favArt').querySelector('span').textContent=state.liked.has(w.id)?'已收藏':'收藏作品';
 $('followArtist').textContent=state.followed.has(w.artistKey)?'✓ 已关注':'＋ 关注';
 if($('pixivSource'))$('pixivSource').href=w.pixivUrl;
 $('btnOriginal').classList.remove('on');$('btnOriginal').querySelector('span').textContent='查看原图';$('btnOriginal').disabled=false;
 const shown=state.shown.length?state.shown:WORKS;
 const i=shown.findIndex(x=>x.id===w.id);
 $('stageCounter').textContent=String(i+1||1).padStart(2,'0')+' / '+String(shown.length).padStart(2,'0');
 relatedDraw();for(const next of related(w,state.relatedPath).slice(0,2)){const img=new Image();img.referrerPolicy='no-referrer';img.src=next.preview}
}

function swapArt(direction){const arr=state.shown.length?state.shown:WORKS;const idx=arr.findIndex(w=>w.id===state.focus?.id);const next=arr[(idx+direction+arr.length)%arr.length];if(next)openReader(next.id,null)}
function resetZoom(animate=true){state.zoom=1;state.panX=0;state.panY=0;applyZoom(animate)}
function applyZoom(animate=true){const image=$('viewerImage');if(!animate)image.classList.add('dragging');else image.classList.remove('dragging');image.style.setProperty('--zoom',state.zoom);image.style.setProperty('--pan-x',state.panX+'px');image.style.setProperty('--pan-y',state.panY+'px');$('zoomValue').textContent=Math.round(state.zoom*100)+'%';$('readerStage').classList.toggle('canpan',state.zoom>1.01);if(!animate)requestAnimationFrame(()=>image.classList.remove('dragging'))}
function changeZoom(next){state.zoom=Math.min(5,Math.max(1,Math.round(next*100)/100));if(state.zoom===1){state.panX=0;state.panY=0}applyZoom()}
function alertOriginal(text){const a=$('originalAlert');a.textContent=text;a.classList.add('show');clearTimeout(window._originalAlertTimer);window._originalAlertTimer=setTimeout(()=>a.classList.remove('show'),2400)}

function toggleOriginal(){
 const w=state.focus;if(!w)return;
 const image=$('viewerImage'),next=!state.original,target=next?w.original:w.preview,id=w.id;
 if(image.src===target)return;
 $('btnOriginal').disabled=true;
 $('btnOriginal').querySelector('span').textContent=next?'原图加载中…':'预览加载中…';
 const preload=new Image();preload.referrerPolicy='no-referrer';
 preload.onload=()=>{
  if(state.focus?.id!==id)return;
  image.src=target;image.style.opacity='1';state.original=next;resetZoom();
  $('btnOriginal').disabled=false;$('btnOriginal').classList.toggle('on',next);
  $('btnOriginal').querySelector('span').textContent=next?'正在查看原图':'查看原图';
  alertOriginal(next?'原图已在站内载入，可单独缩放':'已切回高清预览');
 };
 preload.onerror=()=>{
  if(state.focus?.id!==id)return;
  $('btnOriginal').disabled=false;
  $('btnOriginal').querySelector('span').textContent=state.original?'正在查看原图':'查看原图';
  alertOriginal('外部原图无法载入，可通过 Pixiv 原作确认');
 };
 preload.src=target;
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
$('zoomIn').onclick=()=>changeZoom(state.zoom+.35);$('zoomOut').onclick=()=>changeZoom(state.zoom-.35);$('zoomReset').onclick=()=>resetZoom();$('btnFit').onclick=()=>resetZoom();$('btnOriginal').onclick=toggleOriginal;
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
$('readerStage').addEventListener('wheel',e=>{if(!state.focus)return;e.preventDefault();changeZoom(state.zoom+(e.deltaY<0?.18:-.18))},{passive:false});
// Pointer Events support mouse dragging, swipe-to-next and pinch-to-zoom on mobile.
const pointers=new Map();let anchor=null,pinchDistance=0,pinchStartZoom=1;
function distance(){const p=[...pointers.values()];return Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)}
$('readerStage').addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;state.moving=false;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1)anchor={x:e.clientX,y:e.clientY,panX:state.panX,panY:state.panY};if(pointers.size===2){pinchDistance=distance();pinchStartZoom=state.zoom;anchor=null}try{$('readerStage').setPointerCapture(e.pointerId)}catch{}});
$('readerStage').addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){state.zoom=Math.min(5,Math.max(1,pinchStartZoom*distance()/Math.max(1,pinchDistance)));applyZoom(false);state.moving=true;return}if(!anchor)return;const dx=e.clientX-anchor.x,dy=e.clientY-anchor.y;if(Math.abs(dx)+Math.abs(dy)>8)state.moving=true;if(state.zoom>1.01){state.panX=anchor.panX+dx;state.panY=anchor.panY+dy;applyZoom(false)}});
function pointerEnd(e){if(!pointers.has(e.pointerId))return;const dx=anchor?e.clientX-anchor.x:0;pointers.delete(e.pointerId);if(pointers.size===0){if(state.zoom<=1.01&&Math.abs(dx)>75&&state.moving){swapArt(dx<0?1:-1)}if(state.zoom<1.02)resetZoom(false);anchor=null;setTimeout(()=>state.moving=false,50)}else if(pointers.size===1){const p=[...pointers.values()][0];anchor={x:p.x,y:p.y,panX:state.panX,panY:state.panY}}}
$('readerStage').addEventListener('pointerup',pointerEnd);$('readerStage').addEventListener('pointercancel',pointerEnd);
let prevCols=innerWidth<=650?2:innerWidth<=850?3:4;window.addEventListener('resize',()=>{const n=innerWidth<=650?2:innerWidth<=850?3:4;if(n!==prevCols){prevCols=n;draw()}});

renderRanks();draw();
async function hydrateRealPixiv(){
 try{
  const response=await fetch('/assets/pixiv-feed.json',{cache:'force-cache'});
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
