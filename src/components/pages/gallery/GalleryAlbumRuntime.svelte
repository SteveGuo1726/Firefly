<script lang="ts">
import type { FancyboxOptions } from "@fancyapps/ui";
import { onMount } from "svelte";
import type { PublicGalleryAlbum } from "@/types/galleryAdmin";
import { fetchPublicGallery } from "@/utils/admin/imagebed-client";
import { url } from "@/utils/url-utils";

interface Props {
	albumId?: string;
	initialAlbum?: PublicGalleryAlbum | null;
	initialAlbums?: PublicGalleryAlbum[];
	columnWidth?: number;
}

const {
	albumId = "",
	initialAlbum = null,
	initialAlbums = [],
	columnWidth = 240,
}: Props = $props();
let album = $state<PublicGalleryAlbum | null>(initialAlbum);
let loading = $state(!initialAlbum);
let errorMessage = $state("");
let galleryRoot: HTMLDivElement;
let lightboxPromise: Promise<typeof import("@fancyapps/ui").Fancybox> | null =
	null;

const photoSelector = "a[data-gallery-photo]";
const lightboxOptions: Partial<FancyboxOptions> = {
	Thumbs: {
		autoStart: true,
		showOnStart: "yes",
	},
	Toolbar: {
		display: {
			left: ["infobar"],
			middle: [
				"zoomIn",
				"zoomOut",
				"toggle1to1",
				"rotateCCW",
				"rotateCW",
				"flipX",
				"flipY",
			],
			right: ["slideshow", "thumbs", "close"],
		},
	},
	animated: true,
	dragToClose: true,
	fitToView: true,
	preload: 3,
	infinite: true,
	caption: false,
};

async function openPhoto(event: MouseEvent): Promise<void> {
	event.preventDefault();
	const trigger = event.currentTarget;
	if (!(trigger instanceof HTMLElement)) return;
	const Fancybox = await lightboxPromise;
	Fancybox?.fromTriggerEl(trigger, lightboxOptions);
}

async function loadAlbum(): Promise<void> {
	const id =
		albumId || new URLSearchParams(window.location.search).get("album") || "";
	if (!id) {
		errorMessage = "缺少相册参数。";
		loading = false;
		return;
	}
	const fallbackAlbum =
		initialAlbum?.id === id
			? initialAlbum
			: initialAlbums.find((candidate) => candidate.id === id) || null;
	if (fallbackAlbum) album = fallbackAlbum;
	errorMessage = "";
	try {
		let payload: { albums: PublicGalleryAlbum[] };
		try {
			payload = await fetchPublicGallery(id);
		} catch {
			await new Promise((resolve) => window.setTimeout(resolve, 600));
			payload = await fetchPublicGallery(id);
		}
		album = payload.albums[0] || fallbackAlbum;
		if (!album) errorMessage = "相册不存在或尚未发布。";
	} catch (error) {
		if (!fallbackAlbum)
			errorMessage = error instanceof Error ? error.message : "相册读取失败。";
	} finally {
		loading = false;
	}
}

onMount(() => {
	const root = galleryRoot;
	lightboxPromise = import("@fancyapps/ui").then(({ Fancybox }) => {
		Fancybox.bind(root, photoSelector, lightboxOptions);
		return Fancybox;
	});
	void loadAlbum();

	return () => {
		void lightboxPromise?.then((Fancybox) => {
			Fancybox.unbind(root, photoSelector);
		});
	};
});
</script>

<div class="gallery-runtime" bind:this={galleryRoot}>
{#if album}
	<section class="album-hero">
		{#if album.coverUrl}<img src={album.coverUrl} alt={album.name} />{/if}
		<div class="hero-shade"></div>
		<a class="back" href={url("/gallery/")}>← 返回相册</a>
		<div class="hero-info">
			<h1>{album.name}</h1>
			{#if album.description}<p>{album.description}</p>{/if}
			<div class="meta">
				{#if album.date}<span>{album.date}</span>{/if}
				{#if album.location}<span>{album.location}</span>{/if}
				<span>{album.photoCount} 张照片</span>
			</div>
			{#if album.tags?.length}<div class="tags">{#each album.tags as tag}<span>{tag}</span>{/each}</div>{/if}
		</div>
	</section>

	<section class="photo-section card-base">
		{#if album.photos.length > 0}
			<div class="masonry" style={`--column-width: ${columnWidth}px`}>
				{#each album.photos as photo (photo.key)}
					<a class="photo" href={photo.url} data-fancybox={`gallery-${album.id}`} data-gallery-photo data-src={photo.url} onclick={openPhoto}>
						<img src={photo.url} alt={photo.name} loading="lazy" decoding="async" />
					</a>
				{/each}
			</div>
		{:else}
			<div class="empty">这个相册还没有图片。</div>
		{/if}
	</section>
{:else if loading}
	<div class="status card-base">正在读取相册...</div>
{:else}
	<div class="status card-base">{errorMessage || "相册不存在。"}</div>
{/if}
</div>

<style>
	.album-hero { position: relative; width: 100%; min-height: 13rem; max-height: 22rem; aspect-ratio: 3 / 1; overflow: hidden; border-radius: var(--radius-large); background: rgb(127 127 127 / 0.15); color: white; }
	.album-hero > img { display: block; width: 100%; height: 100%; object-fit: cover; }
	.hero-shade { position: absolute; inset: 0; background: linear-gradient(to top, rgb(0 0 0 / 0.76), rgb(0 0 0 / 0.08)); }
	.back { position: absolute; top: 1rem; left: 1rem; padding: 0.42rem 0.7rem; border-radius: 0.4rem; background: rgb(0 0 0 / 0.38); color: white; font-size: 0.78rem; backdrop-filter: blur(8px); }
	.hero-info { position: absolute; left: 0; right: 0; bottom: 0; padding: 1.4rem; }
	.hero-info h1 { margin: 0; font-size: 1.7rem; font-weight: 800; letter-spacing: 0; }
	.hero-info p { max-width: 42rem; margin: 0.35rem 0 0; font-size: 0.82rem; color: rgb(255 255 255 / 0.8); }
	.meta, .tags { display: flex; flex-wrap: wrap; gap: 0.65rem; margin-top: 0.5rem; font-size: 0.72rem; color: rgb(255 255 255 / 0.78); }
	.tags { gap: 0.3rem; }
	.tags span { padding: 0.18rem 0.4rem; border-radius: 0.25rem; background: rgb(255 255 255 / 0.18); }
	.photo-section { width: 100%; margin-top: 1rem; padding: 1rem; }
	.masonry { columns: var(--column-width); column-gap: 0.75rem; }
	.photo { display: block; break-inside: avoid; margin-bottom: 0.75rem; overflow: hidden; border-radius: 0.5rem; background: rgb(127 127 127 / 0.12); }
	.photo img { display: block; width: 100%; height: auto; transition: transform 250ms ease; }
	.photo:hover img { transform: scale(1.025); }
	.empty, .status { padding: 3rem 1rem; text-align: center; opacity: 0.6; }
	@media (max-width: 560px) { .album-hero { aspect-ratio: 4 / 3; } .hero-info { padding: 1rem; } .hero-info h1 { font-size: 1.35rem; } .masonry { columns: 2; } }
</style>
