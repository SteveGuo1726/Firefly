<script lang="ts">
import { onMount } from "svelte";

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
export let enabled = true;

let liveOnly: LivePost[] = [];

function postUrl(id: string) {
	return "/posts/" + id.split("/").map(encodeURIComponent).join("/") + "/";
}

function publishedTime(entry: LivePost) {
	const value = entry.meta?.published || "";
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function applyStaticOverlay(entries: LivePost[]) {
	for (const entry of entries) {
		const selector = `[data-post-id="${CSS.escape(entry.id)}"]`;
		const card = document.querySelector<HTMLElement>(selector);
		if (!card) continue;

		if (entry.deleted || entry.hidden) {
			const yearBlock = card.closest<HTMLElement>(".archive-year-block");
			card.remove();
			if (yearBlock) {
				const remaining = yearBlock.querySelectorAll(".archive-post").length;
				const count = yearBlock.querySelector<HTMLElement>(".archive-year-count");
				if (count) count.textContent = String(remaining);
				if (remaining === 0) yearBlock.hidden = true;
			}
			continue;
		}

		const title = card.querySelector<HTMLElement>("[data-post-card-title]");
		const description = card.querySelector<HTMLElement>("[data-post-card-description]");
		if (title && entry.meta?.title) title.textContent = entry.meta.title;
		if (description && entry.meta?.description !== undefined) {
			description.textContent = entry.meta.description;
		}
		card.dataset.liveRevision = String((entry as any).revision || "");
	}
}

onMount(() => {
	if (!enabled) return;
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
			liveOnly = entries
				.filter(
					(entry) =>
						!entry.deleted &&
						!entry.hidden &&
						!staticSet.has(entry.id) &&
						entry.meta?.title,
				)
				.sort((a, b) => {
					if (a.meta?.pinned && !b.meta?.pinned) return -1;
					if (!a.meta?.pinned && b.meta?.pinned) return 1;
					return publishedTime(b) - publishedTime(a);
				});

			await Promise.resolve();
			window.dispatchEvent(new CustomEvent("livePostsUpdated"));
		} catch (error) {
			console.warn("Live post discovery unavailable", error);
		}
	};
	void load();
});
</script>

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

<style>
.live-post-card{display:flex;flex-direction:column;gap:.65rem;min-height:10rem;border:1px solid color-mix(in oklab,var(--primary) 22%,transparent)}
.live-badge{position:absolute;right:1rem;top:1rem;font-size:.68rem;font-weight:800;color:var(--primary);background:color-mix(in oklab,var(--primary) 10%,transparent);padding:.28rem .5rem;border-radius:999px}
.live-title{display:block;padding-right:5rem;font-size:1.45rem;line-height:1.35;font-weight:800;color:color-mix(in oklab,currentColor 90%,transparent);text-decoration:none}
.live-title:hover{color:var(--primary)}
.live-meta,.live-tags{display:flex;flex-wrap:wrap;gap:.4rem .8rem;font-size:.72rem;opacity:.56}
.live-description{margin:0;opacity:.72;line-height:1.65;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.live-tags{margin-top:auto;color:var(--primary)}
</style>
