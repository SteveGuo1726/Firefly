<script lang="ts">
import {onMount} from "svelte";
import type {GitHubAdminSession} from "@/utils/admin/github-session";
import {fetchLiveContentIndex} from "@/utils/admin/live-content-client";
export let session:GitHubAdminSession;
let loading=false;
let error="";
let basePosts=0,baseMoments=0;
let livePosts=0,liveMoments=0,deletedPosts=0,deletedMoments=0;
let latest:{kind:string;id:string;updatedAt:string;deleted:boolean}[]=[];
async function refresh(){
 if(loading)return;
 loading=true;error="";
 try{
  const [base,posts,moments]=await Promise.all([
   fetch("/api/admin-content-index.json",{cache:"no-store"}).then(async r=>{if(!r.ok)throw Error("静态索引读取失败");return r.json();}),
   fetchLiveContentIndex("post",session),
   fetchLiveContentIndex("dynamic",session)
  ]);
  basePosts=Array.isArray(base.posts)?base.posts.length:0;
  baseMoments=Array.isArray(base.dynamics)?base.dynamics.length:0;
  livePosts=posts.entries.filter(e=>!e.deleted).length;
  liveMoments=moments.entries.filter(e=>!e.deleted).length;
  deletedPosts=posts.entries.filter(e=>e.deleted).length;
  deletedMoments=moments.entries.filter(e=>e.deleted).length;
  latest=[
   ...posts.entries.map(e=>({kind:"文章",id:e.id,updatedAt:e.updatedAt,deleted:e.deleted})),
   ...moments.entries.map(e=>({kind:"动态",id:e.id,updatedAt:e.updatedAt,deleted:e.deleted}))
  ].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,12);
 }catch(e){error=e instanceof Error?e.message:"后台仪表盘加载失败。";}
 finally{loading=false;}
}
onMount(()=>{void refresh();});
</script>
<section class="dashboard">
 <header class="card-base"><div><h2>后台总览</h2><p>Git 静态基线与 Blob 实时覆盖层分开统计，避免重复计数。</p></div><button onclick={refresh} disabled={loading}>{loading?"刷新中...":"刷新数据"}</button></header>
 {#if error}<p role="alert" class="error card-base">{error}</p>{/if}
 <div class="stats">
  <article class="card-base"><strong>{basePosts}</strong><span>Git 基线文章</span></article>
  <article class="card-base"><strong>{livePosts}</strong><span>实时文章覆盖</span></article>
  <article class="card-base"><strong>{baseMoments}</strong><span>Git 基线动态</span></article>
  <article class="card-base"><strong>{liveMoments}</strong><span>实时动态覆盖</span></article>
  <article class="card-base"><strong>{deletedPosts+deletedMoments}</strong><span>实时删除标记</span></article>
 </div>
 <section class="card-base activity"><h3>最近实时变更</h3>
  {#if latest.length===0}<p>暂无实时修改记录。</p>
  {:else}<div class="changes">{#each latest as item}
   <div><span>{item.kind}</span><strong>{item.id}</strong><small>{item.deleted?"已删除":"已修改"} · {item.updatedAt}</small></div>
  {/each}</div>{/if}
 </section>
 <p class="hint">实时覆盖数不代表最终公开总文章数；新增、修改和静态重叠项将在公开列表按 ID 合并。</p>
</section>
<style>
.dashboard{display:grid;gap:1rem}.dashboard>header{padding:1.2rem;display:flex;justify-content:space-between;gap:1rem;align-items:center}.dashboard h2{font-size:1.35rem;font-weight:800;margin:0}.dashboard header p,.hint{font-size:.8rem;opacity:.65;margin:.3rem 0}.dashboard button{border:1px solid var(--line-divider);border-radius:.55rem;background:transparent;color:inherit;font:inherit;padding:.6rem .8rem;cursor:pointer}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.8rem}.stats article{padding:1.2rem;display:grid;gap:.5rem}.stats strong{font-size:2rem;font-weight:850;color:var(--primary)}.stats span{font-size:.8rem;opacity:.65}.activity{padding:1.2rem}.activity h3{font-size:1rem;font-weight:800;margin:0 0 .8rem}.changes{display:grid;gap:.4rem}.changes>div{display:flex;gap:.8rem;align-items:center;flex-wrap:wrap;padding:.55rem;border-bottom:1px solid var(--line-divider)}.changes strong{flex:1;overflow-wrap:anywhere}.changes small{opacity:.55;font-size:.72rem}.error{padding:1rem;color:#c43d3d}.hint{padding:0 .5rem}
</style>
