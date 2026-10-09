<script lang="ts">
import { onMount } from "svelte";
import { mergeLiveTaxonomy, type TaxonomyTerm, type TaxonomyStaticPost, type TaxonomyLivePost, type TaxonomyMode } from "@/utils/live-taxonomy";

export let mode: TaxonomyMode;
export let baseline: TaxonomyTerm[] = [];
export let staticPosts: TaxonomyStaticPost[] = [];
export let uncategorized = "未分类";
let live: TaxonomyLivePost[] = [];
let busy = false;
let lastUpdated = 0;
let disposed = false;
$: terms = mergeLiveTaxonomy(baseline, staticPosts, live, mode, uncategorized);
$: topTerms = [...terms].sort((a, b) => b.count - a.count).slice(0, 10);
$: topCount = Math.max(1, topTerms[0]?.count || 1);
$: totalPosts = terms.reduce((sum, term) => sum + term.count, 0);

function linkFor(name: string): string {
 if (mode === "tag") return "/archive/?tag=" + encodeURIComponent(name);
 return name === uncategorized ? "/archive/?uncategorized=true" : "/archive/?category=" + encodeURIComponent(name);
}
async function refresh(): Promise<void> {
 if (busy || disposed) return;
 busy = true;
 try {
  const response = await fetch("/api/live-content/index?kind=post", {cache:"no-store"});
  if (!response.ok) return;
  const result = await response.json();
  if (!disposed && Array.isArray(result?.entries)) live = result.entries;
 } catch (error) {
  console.warn("Live taxonomy unavailable; retaining static terms", error);
 } finally {
  lastUpdated = Date.now();
  busy = false;
 }
}
onMount(() => {
 const refreshIfStale = () => {
  if (document.visibilityState === "visible" && Date.now() - lastUpdated > 3000) void refresh();
 };
 const onStorage = (event: StorageEvent) => {
  if (event.key !== "firefly:live-content-updated" || !event.newValue) return;
  try {
   if (JSON.parse(event.newValue)?.kind === "post") void refresh();
  } catch { /* Ignore malformed notifications */ }
 };
 window.addEventListener("storage", onStorage);
 window.addEventListener("pageshow", refreshIfStale);
 window.addEventListener("focus", refreshIfStale);
 document.addEventListener("visibilitychange", refreshIfStale);
 void refresh();
 return () => {
  disposed = true;
  window.removeEventListener("storage", onStorage);
  window.removeEventListener("pageshow", refreshIfStale);
  window.removeEventListener("focus", refreshIfStale);
  document.removeEventListener("visibilitychange", refreshIfStale);
 };
});
</script>

<div class="taxonomy-page">
 <div class="heading card-base">
  <h1>{mode === "tag" ? "标签" : "分类"}</h1>
  <p>{mode === "tag" ? terms.length + " 个标签" : totalPosts + " 篇文章"} · 包括实时内容</p>
 </div>
 {#if terms.length === 0}
  <div class="empty card-base">暂无公开{mode === "tag" ? "标签" : "分类"}</div>
 {:else if mode === "tag"}
  <div class="tag-panel card-base">
   <div class="tags">
    {#each terms as term (term.name)}
     <a class="tag-item" href={linkFor(term.name)}>
      <span>{term.name}</span><strong>{term.count}</strong>
     </a>
    {/each}
   </div>
  </div>
  <section class="ranking card-base">
   <h2>Top 10</h2>
   {#each topTerms as term, i (term.name)}
    <a class="rank" href={linkFor(term.name)}>
     <span class="rank-number">{i + 1}</span>
     <div class="rank-main">
      <div class="rank-title"><span>#{term.name}</span><small>{term.count} 篇</small></div>
      <div class="rank-track"><div class="rank-fill" style:width={(term.count / topCount * 100) + "%"}></div></div>
     </div>
    </a>
   {/each}
  </section>
 {:else}
  <div class="categories">
   {#each terms as term (term.name)}
    <a class="category card-base" href={linkFor(term.name)}>
     <span class="category-icon" aria-hidden="true">▣</span>
     <span class="category-copy"><strong>{term.name}</strong><small>{term.count} 篇文章</small></span>
     <span aria-hidden="true">›</span>
    </a>
   {/each}
  </div>
 {/if}
</div>

<style>
.taxonomy-page{display:grid;gap:1rem}.heading{padding:1.5rem 2rem}.heading h1{font-size:1.5rem;font-weight:800;color:var(--primary);margin:0}.heading p{font-size:.8rem;opacity:.6;margin:.4rem 0 0}
.tag-panel{padding:1.5rem 2rem}.tags{display:flex;flex-wrap:wrap;gap:.625rem}.tag-item{display:inline-flex;align-items:center;gap:.45rem;padding:.4rem .7rem;border:1px solid var(--line-divider);border-radius:.5rem;color:inherit;font-size:.87rem;text-decoration:none}.tag-item:hover,.category:hover{border-color:var(--primary);color:var(--primary)}.tag-item strong{font-size:.68rem;color:var(--primary);background:color-mix(in oklab,var(--primary) 12%,transparent);border-radius:.25rem;padding:.12rem .35rem}
.ranking{padding:1.5rem 2rem}.ranking h2{font-weight:800;font-size:1.1rem;margin:0 0 .9rem}.rank{display:flex;align-items:center;gap:.75rem;padding:.55rem;border-radius:.5rem;color:inherit;text-decoration:none}.rank:hover{background:var(--btn-card-bg-hover)}.rank-number{width:1.25rem;text-align:right;font-weight:800;color:var(--primary)}.rank-main{flex:1;min-width:0}.rank-title{display:flex;justify-content:space-between;gap:.5rem;font-size:.85rem}.rank-title span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rank-title small{flex:none;opacity:.6}.rank-track{height:.45rem;border-radius:999px;background:color-mix(in oklab,var(--primary) 10%,transparent);overflow:hidden;margin-top:.35rem}.rank-fill{height:100%;border-radius:999px;background:var(--primary)}
.categories{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.category{display:flex;align-items:center;gap:1rem;padding:1.5rem;text-decoration:none;color:inherit;border:1px solid transparent}.category-icon{display:grid;place-items:center;width:3.3rem;height:3.3rem;border-radius:999px;color:var(--primary);background:color-mix(in oklab,var(--primary) 10%,transparent);font-size:1.6rem;flex:none}.category-copy{display:grid;gap:.3rem;flex:1;min-width:0}.category-copy strong{font-size:1.1rem;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.category-copy small{font-size:.8rem;opacity:.6}.empty{text-align:center;padding:3rem;opacity:.65}
@media(max-width:920px){.categories{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:620px){.categories{grid-template-columns:1fr}.heading,.tag-panel,.ranking{padding:1.2rem}.category{padding:1rem}}
</style>
