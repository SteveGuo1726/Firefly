<script lang="ts">
import { onMount } from "svelte";
import { fetchPublicGallery } from "@/utils/gallery-public-client";
import { createGalleryManifestBackup, inspectGalleryManifest } from "@/utils/admin/gallery-manifest-backup";
import type { GalleryManifest, PublicGalleryAlbum } from "@/types/galleryAdmin";

export let onLogout: () => void;

type Tab = "dashboard" | "posts" | "dynamic" | "gallery" | "backup" | "diagnostics";
type Post = { id: string; title: string; description?: string; category?: string; published?: string; path?: string; tags?: string[] };
type Moment = { id: string; excerpt?: string; published?: string; location?: string };
type LiveEntry = { id: string; deleted?: boolean; hidden?: boolean; meta?: Record<string, unknown>; updatedAt?: string };
type PublicIndex = { posts?: Post[]; dynamics?: Moment[] };
type Check = { name: string; ok: boolean; detail: string; elapsed: number };

let tab: Tab = "dashboard";
let posts: Post[] = [];
let moments: Moment[] = [];
let albums: PublicGalleryAlbum[] = [];
let loading = false;
let issue = "";
let search = "";
let selectedPost = "";
let selectedMoment = "";
let selectedAlbum = "";
let scratchTitle = "";
let scratchBody = "";
let scratchAlbumName = "";
let notice = "";
let diagnostics: Check[] = [];
let checking = false;
let updatedAt = "";

function choose(next: Tab) {
 tab = next;
 const url = new URL(window.location.href);
 url.searchParams.set("section",next);
 history.replaceState(history.state,"",url);
}
function normalizeTab(): Tab {
 const value = new URLSearchParams(location.search).get("section");
 return value === "posts" || value === "dynamic" || value === "gallery" ||
  value === "backup" || value === "diagnostics" ? value : "dashboard";
}
function text(value: unknown): string {
 return typeof value === "string" ? value : "";
}
function mergePublic<T extends {id: string}>(base: T[], live: LiveEntry[], toItem: (entry: LiveEntry) => T): T[] {
 const merged = new Map(base.map(item => [item.id,item]));
 for(const entry of live) {
  if(!entry || typeof entry.id !== "string") continue;
  if(entry.deleted || entry.hidden) merged.delete(entry.id);
  else merged.set(entry.id,{...merged.get(entry.id),...toItem(entry)});
 }
 return [...merged.values()];
}
async function getPublicLive(kind: "post" | "dynamic"): Promise<LiveEntry[]> {
 const response = await fetch(`/api/live-content/index?kind=${kind}`,{cache:"no-store"});
 if(!response.ok) throw new Error(`公开实时内容索引读取失败：${response.status}`);
 const payload = await response.json() as {entries?: LiveEntry[]};
 if(!Array.isArray(payload.entries)) throw new Error("实时索引结构异常");
 return payload.entries;
}
async function refresh() {
 if(loading) return;
 loading=true; issue=""; notice="";
 try {
  const response = await fetch("/api/admin-content-index.json",{cache:"no-store"});
  if(!response.ok) throw new Error(`公开构建索引读取失败：${response.status}`);
  const base = await response.json() as PublicIndex;
  const [livePosts,liveMoments,gallery] = await Promise.allSettled([
   getPublicLive("post"),getPublicLive("dynamic"),fetchPublicGallery("",true)
  ]);
  posts = mergePublic(Array.isArray(base.posts)?base.posts:[],
   livePosts.status==="fulfilled"?livePosts.value:[],
   entry => ({
    id:entry.id,title:text(entry.meta?.title)||entry.id,
    description:text(entry.meta?.description),
    category:text(entry.meta?.category),
    published:text(entry.meta?.published),
    path:`src/content/posts/${entry.id}.md`,
    tags:Array.isArray(entry.meta?.tags)?entry.meta.tags.map(String):[]
   }));
  moments = mergePublic(Array.isArray(base.dynamics)?base.dynamics:[],
   liveMoments.status==="fulfilled"?liveMoments.value:[],
   entry=>({id:entry.id,excerpt:text(entry.meta?.excerpt),published:text(entry.meta?.published),location:text(entry.meta?.location)}));
  albums=gallery.status==="fulfilled"?gallery.value.albums:[];
  if(livePosts.status==="rejected" || liveMoments.status==="rejected" || gallery.status==="rejected") {
   issue="部分公开数据源不可用；当前展示已成功读取的公开数据，不表示完整私有内容。";
  }
  updatedAt=new Date().toLocaleString("zh-CN");
 }catch(error){issue=error instanceof Error?error.message:"数据读取失败";}
 finally{loading=false;}
}
function openPost(item: Post) {
 selectedPost=item.id;selectedMoment="";selectedAlbum="";
 scratchTitle=item.title;
 scratchBody=`# ${item.title}\n\n${item.description || "在这里体验 Markdown 编辑预览。"}`;
 notice="这是浏览器内演示草稿，不是文章源文件；不会提交或修改任何内容。";
}
function openMoment(item: Moment) {
 selectedMoment=item.id;selectedPost="";selectedAlbum="";
 scratchTitle=item.id;
 scratchBody=item.excerpt || "在这里体验动态内容编辑预览。";
 notice="动态编辑仅在浏览器内演示，不会写入 KV 或 Git。";
}
function openAlbum(item: PublicGalleryAlbum) {
 selectedAlbum=item.id;selectedPost="";selectedMoment="";
 scratchAlbumName=item.name;
 notice="这里只测试相册信息表单；保存不会更改真实相册。";
}
function resetScratch() {
 selectedPost="";selectedMoment="";selectedAlbum="";
 scratchTitle="";scratchBody="";scratchAlbumName="";notice="";
}
function publicGalleryManifest(): GalleryManifest {
 return {
  version:1,updatedAt:"",
  albums: albums.map((album) => ({
   id:album.id,sourceDir:album.sourceDir,name:album.name,
   description:album.description,category:album.category,date:album.date,
   location:album.location,tags:[...(album.tags || [])],
   cover:album.cover,photoOrder:[...(album.photoOrder || [])],
  })),
 };
}
function publicGalleryHealth() {
 return inspectGalleryManifest(publicGalleryManifest());
}
async function downloadPublicGalleryBackup() {
 if (!albums.length) return;
 try {
  const {json,sha256,report}=await createGalleryManifestBackup(publicGalleryManifest());
  const url=URL.createObjectURL(new Blob([json],{type:"application/json;charset=utf-8"}));
  const link=document.createElement("a");
  link.href=url;
  link.download="firefly-public-gallery-demo-"+new Date().toISOString().slice(0,10)+".json";
  document.body.appendChild(link);
  link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  notice="仅包含公开相册元数据（不含照片文件）。SHA-256："+sha256+"；"+report.errorCount+" 项错误。";
 } catch(error) {
  issue=error instanceof Error?error.message:"公开相册备份失败。";
 }
}
function localOnly() {
 notice="已检查本地演示状态。只读演示不提供远端保存，未修改任何文章、图片或相册。";
}
async function runDiagnostics() {
 if(checking) return;
 checking=true;diagnostics=[];
 const targets = [
  {name:"构建期公开内容索引",url:"/api/admin-content-index.json"},
  {name:"实时内容服务健康",url:"/api/live-content/health"},
  {name:"公开文章覆盖索引",url:"/api/live-content/index?kind=post"},
  {name:"公开动态覆盖索引",url:"/api/live-content/index?kind=dynamic"}
 ];
 const results = await Promise.all(targets.map(async target=>{
  const start=performance.now();
  try{
   const response=await fetch(target.url,{cache:"no-store",signal:AbortSignal.timeout(8000)});
   const data=await response.json();
   return {name:target.name,ok:response.ok && typeof data==="object",detail:`HTTP ${response.status}`,elapsed:Math.round(performance.now()-start)};
  }catch(error){
   return {name:target.name,ok:false,detail:error instanceof Error?error.message:"读取失败",elapsed:Math.round(performance.now()-start)};
  }
 }));
 const start=performance.now();
 try{
  const gallery=await fetchPublicGallery("",true,8000);
  results.push({name:"公开相册服务",ok:true,detail:`${gallery.albums.length} 个相册`,elapsed:Math.round(performance.now()-start)});
 }catch(error){
  results.push({name:"公开相册服务",ok:false,detail:error instanceof Error?error.message:"读取失败",elapsed:Math.round(performance.now()-start)});
 }
 diagnostics=results;checking=false;
}
function copyDiagnostics(){
 const report={source:"Firefly preview demo (public endpoints only)",time:new Date().toISOString(),results:diagnostics};
 void navigator.clipboard.writeText(JSON.stringify(report,null,2)).then(()=>notice="公开接口诊断报告已复制。").catch(()=>notice="剪贴板不可用，请手动记录检查结果。");
}
onMount(()=>{tab=normalizeTab();void refresh();});
</script>

<div class="demo">
 <header class="card-base demo-header">
  <div><span class="eyebrow">FIREFLY / PREVIEW ONLY</span><h1>后台体验与检查</h1><p>测试入口 admin · 只读演示 · 真实修改需 GitHub 管理员授权</p></div>
  <button type="button" class="outline" onclick={onLogout}>退出演示</button>
 </header>
 <aside class="caution" role="status">公开实验站使用容易猜到的演示口令。此入口不是管理员身份验证：不会读取草稿、私有正文、备份，也不能提交、上传、删除或重命名远端数据。</aside>
 <nav class="tabs card-base" aria-label="后台演示菜单">
  <button class:active={tab==="dashboard"} onclick={()=>choose("dashboard")}>总览</button>
  <button class:active={tab==="posts"} onclick={()=>choose("posts")}>文章</button>
  <button class:active={tab==="dynamic"} onclick={()=>choose("dynamic")}>动态</button>
  <button class:active={tab==="gallery"} onclick={()=>choose("gallery")}>相册</button>
  <button class:active={tab==="backup"} onclick={()=>choose("backup")}>备份</button>
  <button class:active={tab==="diagnostics"} onclick={()=>{choose("diagnostics");if(diagnostics.length===0)void runDiagnostics();}}>诊断</button>
 </nav>
 <div class="toolbar"><span>最近读取：{updatedAt || "尚未读取"}</span><button type="button" class="outline" disabled={loading} onclick={refresh}>{loading?"刷新中...":"刷新公开数据"}</button></div>
 {#if issue}<p class="issue" role="alert">{issue}</p>{/if}
 {#if notice}<p class="notice" role="status">{notice}</p>{/if}
 {#if tab==="dashboard"}
  <section class="stats">
   <article class="card-base"><strong>{posts.length}</strong><span>可公开文章（基线 + 实时覆盖）</span></article>
   <article class="card-base"><strong>{moments.length}</strong><span>可公开动态</span></article>
   <article class="card-base"><strong>{albums.length}</strong><span>公开相册</span></article>
  </section>
  <section class="card-base panel"><h2>测试范围</h2><p>本页从公开索引和公开相册 API 加载数据；你可以切换功能、搜索列表、填写本地表单、检查相册封面和运行健康诊断。后台真实数据操作、未发布内容以及备份导出依旧需要正式管理员登录。</p></section>
 {:else if tab==="posts" || tab==="dynamic"}
  <section class="card-base panel">
   <h2>{tab==="posts"?"公开文章":"公开动态"}列表</h2>
   <label class="search"><span>筛选</span><input type="search" bind:value={search} placeholder="输入标题、分类或标识" /></label>
   <div class="two-column">
    <div class="entries">
     {#each (tab==="posts"?posts:moments).filter(item=>JSON.stringify(item).toLowerCase().includes(search.toLowerCase())) as item (item.id)}
      <button type="button" class:chosen={(selectedPost||selectedMoment)===item.id} onclick={()=>tab==="posts"?openPost(item as Post):openMoment(item as Moment)}>
       <strong>{tab==="posts"?(item as Post).title:(item as Moment).excerpt||item.id}</strong>
       <small>{item.id} · {item.published||"未指定日期"}</small>
      </button>
     {:else}<p>没有匹配的公开记录。</p>{/each}
    </div>
    <div class="editor">
     {#if selectedPost||selectedMoment}
      <h3>本地编辑体验 <small>未连接写入 API</small></h3>
      <label><span>{tab==="posts"?"标题":"动态标识"}</span><input bind:value={scratchTitle}/></label>
      <label><span>演示 Markdown 内容</span><textarea rows="9" bind:value={scratchBody}/></label>
      <button type="button" class="primary" onclick={localOnly}>校验本地演示内容</button>
      <h3>文本预览</h3>
      <div class="preview">{scratchBody || "尚无预览文本"}</div>
      <button type="button" class="outline" onclick={resetScratch}>清除演示编辑</button>
     {:else}<p>从左侧选择一条公开记录，体验后台编辑布局。不会加载真实正文。</p>{/if}
    </div>
   </div>
  </section>
 {:else if tab==="gallery"}
  <section class="card-base panel">
   <h2>公开相册检查</h2>
   {#if albums.length}
    <div class="check">
     <span class:ok={publicGalleryHealth().errorCount===0}>
      {publicGalleryHealth().errorCount===0?"结构正常":"发现错误"}
     </span>
     <strong>{publicGalleryHealth().albumCount} 个相册 · {publicGalleryHealth().listedPhotoCount} 条排序记录 · {publicGalleryHealth().warningCount} 项提醒</strong>
     <button type="button" class="outline" onclick={downloadPublicGalleryBackup}>下载公开清单 JSON</button>
    </div>
    {#each publicGalleryHealth().issues as health,i (i)}
     <p class="issue">{health.albumId}：{health.message}</p>
    {/each}
   {/if}
   <div class="album-grid">
    {#each albums as album (album.id)}
     <button type="button" class="album" class:chosen={selectedAlbum===album.id} onclick={()=>openAlbum(album)}>
      {#if album.coverUrl}<img alt={album.name} src={album.coverUrl} loading="lazy" />{:else}<span class="placeholder">暂无封面</span>{/if}
      <strong>{album.name}</strong><small>{album.photoCount} 张 · {album.sourceDir}</small>
     </button>
    {:else}<p>暂无公开相册，或公开 API 暂时不可用。</p>{/each}
   </div>
   {#if selectedAlbum}
    <div class="editor">
     <h3>相册信息演示</h3><label><span>相册名称（本地）</span><input bind:value={scratchAlbumName}/></label>
     <button type="button" class="primary" onclick={localOnly}>检查表单（不保存）</button>
    </div>
   {/if}
  </section>
 {:else if tab==="backup"}
  <section class="card-base panel">
   <h2>备份与恢复（演示）</h2><p>真实备份会包含未公开草稿和历史正文，因此不允许通过简单口令取得。演示入口仅展示恢复流程，不提供私有导出。</p>
   <p>正式管理员可下载 JSON 快照、查看 SHA-256 校验值，并按单篇历史记录恢复。图库与评论属于不同存储，需分别备份。</p>
   <a href="https://github.com/SteveGuo1726/Firefly/blob/ai/preview-test/docs/cms2-backup-recovery.md" target="_blank" rel="noreferrer">查看备份校验与恢复说明</a>
  </section>
 {:else if tab==="diagnostics"}
  <section class="card-base panel">
   <h2>公开服务健康诊断</h2><p>只发起 GET 请求，不读取私有凭证、不修改数据。结果可以复制以便排查问题。</p>
   <div class="actions"><button type="button" class="primary" onclick={runDiagnostics} disabled={checking}>{checking?"检查中...":"重新运行诊断"}</button><button type="button" class="outline" onclick={copyDiagnostics} disabled={!diagnostics.length}>复制报告</button></div>
   {#each diagnostics as check}
    <div class="check"><span class:ok={check.ok}>{check.ok?"正常":"异常"}</span><strong>{check.name}</strong><small>{check.detail} · {check.elapsed} ms</small></div>
   {/each}
  </section>
 {/if}
</div>
<style>
.demo{display:grid;gap:1rem}.demo-header{padding:1.2rem;display:flex;align-items:center;justify-content:space-between;gap:1rem}.eyebrow{font-size:.7rem;letter-spacing:.15em;opacity:.5}h1{font-size:1.45rem;font-weight:800;margin:.2rem 0}.demo-header p,.panel p{font-size:.88rem;opacity:.75;margin:.35rem 0}.caution{border:1px solid #d89c54;background:rgb(216 156 84 / 10%);border-radius:.7rem;padding:1rem;line-height:1.6;font-size:.88rem}.tabs{padding:.5rem;display:flex;flex-wrap:wrap;gap:.4rem}.tabs button{padding:.65rem .95rem;border:0;border-radius:.55rem;background:transparent;color:inherit;cursor:pointer;font-weight:700}.tabs button.active{background:color-mix(in srgb,var(--primary) 16%,transparent)}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:0 .2rem;font-size:.8rem;opacity:.8}.outline,.primary{padding:.65rem .9rem;border-radius:.55rem;cursor:pointer;font:inherit;font-weight:700}.outline{background:transparent;color:inherit;border:1px solid var(--line-divider)}.primary{background:var(--primary);color:#fff;border:0}button:disabled{opacity:.45;cursor:not-allowed}.issue,.notice{padding:.7rem 1rem;border-radius:.55rem;border:1px solid var(--line-divider)}.issue{color:#bf3434}.notice{color:var(--primary)}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem}.stats article{padding:1.3rem;display:grid;gap:.6rem}.stats strong{font-size:2rem;color:var(--primary)}.stats span{font-size:.8rem;opacity:.7}.panel{padding:1.4rem;display:grid;gap:.8rem}h2{font-size:1.1rem;margin:0;font-weight:800}.search,.editor label{display:grid;gap:.35rem;font-size:.85rem}.search input,.editor input,.editor textarea{width:100%;box-sizing:border-box;border:1px solid var(--line-divider);border-radius:.45rem;padding:.75rem;background:transparent;color:inherit;font:inherit}.two-column{display:grid;grid-template-columns:minmax(240px,1fr) minmax(270px,1.2fr);gap:1rem}.entries{display:grid;align-content:start;gap:.45rem;max-height:65vh;overflow:auto}.entries button{display:grid;gap:.4rem;text-align:left;padding:.85rem;border:1px solid var(--line-divider);border-radius:.5rem;background:transparent;color:inherit;cursor:pointer}.entries button.chosen,.album.chosen{border-color:var(--primary)}.entries button strong{font-size:.85rem;overflow-wrap:anywhere}.entries button small,.album small,.editor small{font-size:.73rem;opacity:.6;overflow-wrap:anywhere}.editor{display:grid;align-content:start;gap:.7rem;border:1px solid var(--line-divider);padding:1rem;border-radius:.6rem}.editor h3{font-size:1rem;margin:0}.preview{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;border:1px dashed var(--line-divider);border-radius:.5rem;min-height:5rem;padding:1rem}.album-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:.7rem}.album{display:grid;text-align:left;gap:.45rem;padding:.5rem;border:1px solid var(--line-divider);border-radius:.6rem;background:transparent;color:inherit;cursor:pointer}.album img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:.4rem}.placeholder{display:grid;place-items:center;min-height:110px}.actions{display:flex;gap:.65rem;flex-wrap:wrap}.check{display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;padding:.6rem 0;border-bottom:1px solid var(--line-divider)}.check strong{flex:1}.check span{font-weight:800;color:#b53c3c}.check span.ok{color:#319065}.check small{opacity:.65}@media(max-width:760px){.two-column{grid-template-columns:1fr}.demo-header{align-items:flex-start;flex-direction:column}}
</style>
