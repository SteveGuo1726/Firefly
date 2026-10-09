<script lang="ts">
import { onMount, tick } from "svelte";

type LivePost = {
	id: string;
	deleted?: boolean;
	hidden?: boolean;
	meta?: {
		title?: string;
		description?: string;
		published?: string;
		updated?: string;
		category?: string;
		tags?: string[];
		pinned?: boolean;
	};
};

export let staticIds: string[] = [];
export let discoverLiveOnly = true;
export let variant: "cards" | "archive" = "cards";

let liveOnly: LivePost[] = [];

function postUrl(id: string) {
	return "/posts/" + id.split("/").map(encodeURIComponent).join("/") + "/";
}

function publishedTime(entry: LivePost) {
	const value = entry.meta?.published || "";
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function archiveDate(value: string | undefined) {
	const match = String(value || "").match(/^\d{4}-(\d{2})-(\d{2})/);
	return match ? `${match[1]}-${match[2]}` : "-- --";
}

function matchesArchiveFilter(entry: LivePost) {
	if (variant !== "archive" || typeof window === "undefined") return true;
	const params = new URLSearchParams(window.location.search);
	const tags = params.getAll("tag");
	const categories = params.getAll("category");
	const uncategorized = params.get("uncategorized");
	const entryTags = Array.isArray(entry.meta?.tags) ? entry.meta?.tags || [] : [];
	const category = String(entry.meta?.category || "");
	if (tags.length > 0 && !entryTags.some((tag) => tags.includes(tag))) return false;
	if (categories.length > 0 && (!category || !categories.includes(category))) return false;
	if (uncategorized && category) return false;
	return true;
}

function applyStaticOverlay(entries: LivePost[]) {
 const byId = new Map(entries.map(entry => [entry.id, entry]));
 for (const card of document.querySelectorAll<HTMLElement>("[data-post-id]:not([data-live-post])")) {
  const entry = byId.get(card.dataset.postId || "");
  if (!entry) continue;
  const hidden = Boolean(entry.deleted || entry.hidden);
  card.hidden = hidden;
  card.style.display = hidden ? "none" : "";
  if (hidden) continue;
  const title = card.querySelector<HTMLElement>("[data-post-card-title]");
  const description = card.querySelector<HTMLElement>("[data-post-card-description]");
  if (card.matches(".archive-post")) {
   card.dataset.tags = JSON.stringify(entry.meta?.tags || []);
   card.dataset.category = String(entry.meta?.category || "");
  }
  if (title && entry.meta?.title) title.textContent = entry.meta.title;
  if (description && entry.meta?.description !== undefined) description.textContent = entry.meta.description;
  card.dataset.liveRevision = String((entry as any).revision || "");
 }
 for (const block of document.querySelectorAll<HTMLElement>(".archive-year-block")) {
  const count = [...block.querySelectorAll<HTMLElement>(".archive-post")].filter(card => !card.hidden).length;
  const label = block.querySelector<HTMLElement>(".archive-year-count");
  if (label) label.textContent = String(count);
  block.hidden = count === 0;
 }
}

onMount(() => {
	const load = async () => {
		try {
			const response = await fetch("/api/live-content/index?kind=post", {
				cache: "no-store",
			});
			if (!response.ok) return;
			const payload = await response.json();
			const entries: LivePost[] = Array.isArray(payload?.entries)
				? payload.entries
				: [];
			applyStaticOverlay(entries);

			const staticSet = new Set(staticIds);
			liveOnly = discoverLiveOnly ? entries
				.filter(
					(entry) =>
						!entry.deleted &&
						!entry.hidden &&
						!staticSet.has(entry.id) &&
						entry.meta?.title &&
						matchesArchiveFilter(entry),
				)
				.sort((a, b) => {
					if (a.meta?.pinned && !b.meta?.pinned) return -1;
					if (!a.meta?.pinned && b.meta?.pinned) return 1;
					return publishedTime(b) - publishedTime(a);
				})
				: [];

			await tick();
			window.dispatchEvent(new CustomEvent("livePostsUpdated"));
		} catch (error) {
			console.warn("Live post discovery unavailable", error);
		}
	};
	void load();
});
</script>

{#if variant === "archive"}
	{#if liveOnly.length > 0}
		<section
			class="live-archive"
			data-live-archive-count={liveOnly.length}
			aria-label="实时发布文章"
		>
			<div class="live-archive-heading">
				<strong>实时发布</strong>
				<span>{liveOnly.length} 篇尚未归档构建</span>
			</div>
			{#each liveOnly as entry (entry.id)}
				<a
					href={postUrl(entry.id)}
					class="live-archive-row"
					data-post-id={entry.id}
					data-live-post="true"
					data-tags={JSON.stringify(entry.meta?.tags || [])}
					data-category={entry.meta?.category || ""}
				>
					<span class="live-date">{archiveDate(entry.meta?.published)}</span>
					<span class="live-dot"></span>
					<span class="live-archive-title">
						{#if entry.meta?.category}<em>{entry.meta.category}</em>{/if}
						<strong>{entry.meta?.title || entry.id}</strong>
					</span>
					<span class="live-archive-tags">
						{#each (entry.meta?.tags || []).slice(0, 3) as tag}#{tag} {/each}
					</span>
				</a>
			{/each}
		</section>
	{/if}
{:else}
	{#each liveOnly as entry (entry.id)}
		<article
			class="post-card-item live-post-card card-base relative rounded-(--radius-large) overflow-hidden p-5 md:p-7"
			data-post-id={entry.id}
			data-live-post="true"
		>
			<div class="live-badge">实时发布</div>
			<a class="live-title" href={postUrl(entry.id)}>{entry.meta?.title || entry.id}</a>
			<div class="live-meta">
				{#if entry.meta?.published}<span>{entry.meta.published}</span>{/if}
				{#if entry.meta?.category}<span>{entry.meta.category}</span>{/if}
				{#if entry.meta?.pinned}<span>置顶</span>{/if}
			</div>
			{#if entry.meta?.description}
				<p class="live-description">{entry.meta.description}</p>
			{/if}
			{#if entry.meta?.tags?.length}
				<div class="live-tags">{#each entry.meta.tags.slice(0, 4) as tag}<span>#{tag}</span>{/each}</div>
			{/if}
		</article>
	{/each}
{/if}

<style>
.live-post-card{display:flex;flex-direction:column;gap:.65rem;min-height:10rem;border:1px solid color-mix(in oklab,var(--primary) 22%,transparent)}
.live-badge{position:absolute;right:1rem;top:1rem;font-size:.68rem;font-weight:800;color:var(--primary);background:color-mix(in oklab,var(--primary) 10%,transparent);padding:.28rem .5rem;border-radius:999px}
.live-title{display:block;padding-right:5rem;font-size:1.45rem;line-height:1.35;font-weight:800;color:color-mix(in oklab,currentColor 90%,transparent);text-decoration:none}
.live-title:hover{color:var(--primary)}
.live-meta,.live-tags{display:flex;flex-wrap:wrap;gap:.4rem .8rem;font-size:.72rem;opacity:.56}
.live-description{margin:0;opacity:.72;line-height:1.65;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.live-tags{margin-top:auto;color:var(--primary)}
.live-archive{margin:0 0 1rem;padding:.55rem;border:1px solid color-mix(in oklab,var(--primary) 18%,var(--line-divider));border-radius:.8rem;background:color-mix(in oklab,var(--primary) 4%,transparent)}
.live-archive-heading{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.25rem .45rem .5rem;font-size:.72rem;color:var(--primary)}
.live-archive-heading span{opacity:.65;color:currentColor}
.live-archive-row{display:grid;grid-template-columns:10% 10% minmax(0,65%) minmax(0,15%);align-items:center;min-height:2.5rem;border-radius:.5rem;text-decoration:none;color:inherit}
.live-archive-row:hover{background:var(--btn-plain-bg-hover)}
.live-date{text-align:right;font-size:.78rem;opacity:.55}
.live-dot{width:.3rem;height:.3rem;margin:auto;border-radius:999px;background:var(--primary)}
.live-archive-title{display:flex;align-items:center;gap:.45rem;min-width:0;padding-right:.75rem}
.live-archive-title strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.live-archive-title em{flex:none;font-style:normal;font-size:.68rem;font-weight:700;padding:.14rem .35rem;border-radius:.3rem;background:color-mix(in oklab,var(--primary) 10%,transparent);color:var(--primary)}
.live-archive-tags{font-size:.7rem;opacity:.42;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:767px){.live-archive-row{grid-template-columns:15% 10% minmax(0,75%)}.live-archive-tags{display:none}}
</style>
