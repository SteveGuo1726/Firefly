<script lang="ts">
import { onMount } from "svelte";
import type { PublicGalleryAlbum } from "@/types/galleryAdmin";
import { fetchPublicGallery } from "@/utils/admin/imagebed-client";
import { url } from "@/utils/url-utils";

interface Props {
	initialAlbums: PublicGalleryAlbum[];
	staticAlbumIds: string[];
	managedAlbumIds: string[];
}

const { initialAlbums, staticAlbumIds, managedAlbumIds }: Props = $props();
let albums = $state<PublicGalleryAlbum[]>(
	initialAlbums.filter(
		(album) =>
			staticAlbumIds.includes(album.id) && !managedAlbumIds.includes(album.id),
	),
);
let loading = $state(true);
let query = $state("");
let selectedTag = $state("all");

const tags = $derived(
	Array.from(new Set(albums.flatMap((album) => album.tags || []))).sort(),
);
const filteredAlbums = $derived(
	albums.filter((album) => {
		const keyword = query.trim().toLowerCase();
		const tagMatches =
			selectedTag === "all" || album.tags?.includes(selectedTag);
		const searchMatches =
			!keyword ||
			[
				album.name,
				album.description,
				album.category,
				album.location,
				...(album.tags || []),
			]
				.join(" ")
				.toLowerCase()
				.includes(keyword);
		return tagMatches && searchMatches;
	}),
);

function albumHref(id: string): string {
	return staticAlbumIds.includes(id)
		? url(`/gallery/${id}/`)
		: `${url("/gallery/live/")}?album=${encodeURIComponent(id)}`;
}

onMount(async () => {
	try {
		const payload = await fetchPublicGallery("", true);
		const managedIds = new Set(payload.albums.map((album) => album.id));
		albums = [
			...payload.albums,
			...initialAlbums.filter((album) => !managedIds.has(album.id)),
		];
	} catch {
		albums = initialAlbums;
	} finally {
		loading = false;
	}
});
</script>

{#if albums.length > 0}
	<div class="filters">
		<label class="search-field">
			<span aria-hidden="true">⌕</span>
			<input type="search" bind:value={query} placeholder="搜索相册" aria-label="搜索相册" />
		</label>
		{#if tags.length > 0}
			<div class="tag-list" aria-label="相册标签">
				<button class:active={selectedTag === "all"} type="button" onclick={() => (selectedTag = "all")}>全部</button>
				{#each tags as tag}
					<button class:active={selectedTag === tag} type="button" onclick={() => (selectedTag = tag)}>{tag}</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}

{#if filteredAlbums.length > 0 || loading}
	<div class="album-grid" aria-label={loading ? "正在读取最新相册" : undefined} aria-busy={loading}>
		{#each filteredAlbums as album (album.id)}
			<a class="album-card" href={albumHref(album.id)} data-tags={(album.tags || []).join(",")}>
				<div class="cover">
					{#if album.coverUrl}
						<img src={album.coverUrl} alt={album.name} loading="lazy" decoding="async" />
					{:else}
						<div class="cover-empty" aria-hidden="true">▧</div>
					{/if}
					<div class="shade"></div>
					<span class="photo-count">{album.photoCount} 张</span>
					<div class="album-info">
						<h2>{album.name}</h2>
						{#if album.description}<p>{album.description}</p>{/if}
						<div class="meta">
							{#if album.date}<span>{album.date}</span>{/if}
							{#if album.location}<span>{album.location}</span>{/if}
						</div>
						{#if album.tags?.length}
							<div class="card-tags">
								{#each album.tags.slice(0, 4) as tag}<span>{tag}</span>{/each}
							</div>
						{/if}
					</div>
				</div>
			</a>
		{/each}
		{#if loading}
			{#each Array(Math.max(1, managedAlbumIds.length)) as _}
				<div class="album-skeleton" aria-hidden="true">
					<div class="skeleton-line skeleton-title"></div>
					<div class="skeleton-line skeleton-copy"></div>
				</div>
			{/each}
		{/if}
	</div>
{:else}
	<div class="empty">没有匹配的相册。</div>
{/if}

<style>
	.filters { margin-bottom: 1.25rem; }
	.search-field { position: relative; display: block; margin-bottom: 0.7rem; }
	.search-field span { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); font-size: 1.25rem; opacity: 0.55; }
	.search-field input { width: 100%; height: 2.65rem; padding: 0 0.8rem 0 2.35rem; border: 1px solid var(--line-divider); border-radius: 0.5rem; background: transparent; color: inherit; font: inherit; }
	.tag-list { display: flex; flex-wrap: wrap; gap: 0.45rem; }
	.tag-list button { padding: 0.36rem 0.7rem; border: 1px solid var(--line-divider); border-radius: 999px; background: transparent; color: inherit; font-size: 0.78rem; cursor: pointer; }
	.tag-list button.active { border-color: var(--primary); background: var(--primary); color: white; }
	.album-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin: 1rem 0; }
	.album-skeleton { position: relative; aspect-ratio: 4 / 3; overflow: hidden; border-radius: 0.5rem; background: rgb(127 127 127 / 0.12); }
	.album-skeleton::after { content: ""; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.18), transparent); animation: gallery-shimmer 1.3s infinite; }
	.skeleton-line { position: absolute; z-index: 1; left: 0.9rem; height: 0.65rem; border-radius: 0.2rem; background: rgb(127 127 127 / 0.24); }
	.skeleton-title { right: 42%; bottom: 2.1rem; height: 0.9rem; }
	.skeleton-copy { right: 20%; bottom: 0.9rem; }
	.album-card { display: block; min-width: 0; overflow: hidden; border-radius: 0.5rem; transition: transform 180ms ease, box-shadow 180ms ease; }
	.album-card:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgb(0 0 0 / 0.14); }
	.cover { position: relative; aspect-ratio: 4 / 3; overflow: hidden; background: rgb(127 127 127 / 0.12); }
	.cover > img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform 300ms ease; }
	.album-card:hover .cover > img { transform: scale(1.04); }
	.cover-empty { display: grid; place-items: center; width: 100%; height: 100%; font-size: 3rem; opacity: 0.3; }
	.shade { position: absolute; inset: 0; background: linear-gradient(to top, rgb(0 0 0 / 0.76), rgb(0 0 0 / 0.1) 70%); }
	.photo-count { position: absolute; top: 0.55rem; right: 0.55rem; padding: 0.28rem 0.5rem; border-radius: 999px; background: rgb(0 0 0 / 0.5); color: white; font-size: 0.68rem; }
	.album-info { position: absolute; left: 0; right: 0; bottom: 0; padding: 0.9rem; color: white; }
	.album-info h2 { margin: 0; font-size: 1rem; font-weight: 800; letter-spacing: 0; }
	.album-info p { margin: 0.22rem 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.72rem; color: rgb(255 255 255 / 0.76); }
	.meta { display: flex; gap: 0.65rem; flex-wrap: wrap; margin-top: 0.35rem; font-size: 0.68rem; color: rgb(255 255 255 / 0.72); }
	.card-tags { display: flex; gap: 0.25rem; flex-wrap: wrap; margin-top: 0.4rem; }
	.card-tags span { padding: 0.15rem 0.35rem; border-radius: 0.25rem; background: rgb(255 255 255 / 0.18); font-size: 0.6rem; }
	.empty { padding: 3rem 1rem; text-align: center; opacity: 0.55; }
	@keyframes gallery-shimmer { to { transform: translateX(100%); } }
	@media (prefers-reduced-motion: reduce) { .album-skeleton::after { animation: none; } }
	@media (max-width: 900px) { .album-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	@media (max-width: 560px) { .album-grid { grid-template-columns: 1fr; } }
</style>
