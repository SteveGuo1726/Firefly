<script lang="ts">
import type { FancyboxOptions } from "@fancyapps/ui";
import "@fancyapps/ui/dist/fancybox/fancybox.css";
import "@/styles/fancybox-custom.css";
import { onMount } from "svelte";
import type { PublicGalleryAlbum } from "@/types/galleryAdmin";
import { fetchPublicGallery } from "@/utils/gallery-public-client";
import { url } from "@/utils/url-utils";
import {
 GALLERY_ROUTE_EVENT, galleryGridImage, galleryFullImage, loadGalleryRoute,
 nextGalleryImageFallback, parseGalleryRoute, saveGalleryRoute,
 type GalleryImageRoute,
} from "@/utils/gallery-delivery";

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
let imageRoute = $state<GalleryImageRoute>("auto");
function changeImageRoute(event:Event){
 imageRoute=parseGalleryRoute((event.currentTarget as HTMLSelectElement).value);
 saveGalleryRoute(imageRoute);
}
function onGalleryPhotoError(event:Event,original:string){
 const img=event.currentTarget as HTMLImageElement;
 const next=nextGalleryImageFallback(img.src,original,imageRoute);
 if(next)img.src=next;
}


function safeCaption(name: string, width?: number, height?: number, size?: number): string {
 const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
 const details = [
  width && height ? `${width} × ${height}` : "",
  size ? `${(size / 1024 / 1024).toFixed(2)} MB` : "",
 ].filter(Boolean).join(" · ");
 return escape(name) + (details ? " · " + details : "");
}

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
			],
			right: ["slideshow", "thumbs", "close"],
		},
	},
	animated: true,
	dragToClose: true,
	fitToView: true,
	preload: 1,
	infinite: true,
	caption: true,
};

async function loadAlbum(isDisposed:()=>boolean=()=>false): Promise<void> {
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
	if (fallbackAlbum) {
		album = fallbackAlbum;
		loading = false;
	}
	errorMessage = "";
	try {
		let payload: { albums: PublicGalleryAlbum[] };
		try {
			payload = await fetchPublicGallery(id, false, 7000);
		} catch {
			await new Promise((resolve) => window.setTimeout(resolve, 600));
			payload = await fetchPublicGallery(id, false, 3500);
		}
		if(isDisposed())return;
		const refreshedAlbum = payload.albums[0] || null;
		if (refreshedAlbum) album = refreshedAlbum;
		else if (!album) errorMessage = "相册不存在或尚未发布。";
	} catch (error) {
		if(isDisposed())return;
		album = fallbackAlbum;
		if (!album)
			errorMessage = error instanceof Error ? error.message : "相册读取失败。";
	} finally {
		if(!isDisposed())loading = false;
	}
}

onMount(() => {
 imageRoute=loadGalleryRoute();
 const update=(event:Event)=>{imageRoute=parseGalleryRoute((event as CustomEvent).detail)};
 window.addEventListener(GALLERY_ROUTE_EVENT,update);
	const root = galleryRoot;
	let disposed = false;
	const lightboxPromise = import("@fancyapps/ui")
		.then(({ Fancybox }) => {
			// Swup can unmount the album before the dynamic import resolves.
			if (!disposed) Fancybox.bind(root, photoSelector, lightboxOptions);
			return Fancybox;
		})
		.catch((error) => {
			console.warn("Gallery lightbox unavailable", error);
			return null;
		});
	void loadAlbum(()=>disposed);

	return () => {
		disposed = true;
  window.removeEventListener(GALLERY_ROUTE_EVENT,update);
		void lightboxPromise.then((Fancybox) => {
			if (Fancybox) Fancybox.unbind(root, photoSelector);
		});
	};
});
</script>

<div class="gallery-runtime" bind:this={galleryRoot}>
{#if album}
	<section class="album-hero">
		{#if album.coverUrl}<img src={galleryGridImage(album.coverUrl,imageRoute)} onerror={(event)=>onGalleryPhotoError(event,album.coverUrl)} alt={album.name} loading="eager" decoding="async" fetchpriority="high" />{/if}
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
  <div class="route-control" aria-label="相册图片线路">
   <label for="album-image-route">图片线路</label>
   <select id="album-image-route" value={imageRoute} onchange={changeImageRoute}>
    <option value="auto">智能：缩略图优先（推荐）</option>
    <option value="cloudflare">Cloudflare：缓存原图（实验）</option>
    <option value="original">原图：直接访问 ImageBed</option>
   </select>
   <small>列表加载缩略图，点击查看未压缩的完整原图。图片故障时自动回退。</small>
  </div>
		{#if album.photos.length > 0}
			<div class="masonry" style={`--column-width: ${columnWidth}px`}>
				{#each album.photos as photo (photo.key)}
					<a class="photo" href={galleryFullImage(photo.url,imageRoute)} data-fancybox={`gallery-${album.id}`} data-gallery-photo data-src={galleryFullImage(photo.url,imageRoute)} data-caption={safeCaption(photo.name, photo.width, photo.height, photo.size)} aria-label={`查看 ${photo.name} 的大图详情`}> 
						<img src={galleryGridImage(photo.url,imageRoute)} onerror={(event)=>onGalleryPhotoError(event,photo.url)} alt={photo.name} loading="lazy" decoding="async" fetchpriority="low" />
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
 .route-control{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem;margin-bottom:1rem}
 .route-control label{font-weight:650;font-size:.84rem}
 .route-control select{max-width:100%;border:1px solid var(--line-divider,#9995);border-radius:.6rem;padding:.4rem .6rem;background:var(--card-bg,transparent);color:inherit}
 .route-control small{font-size:.77rem;opacity:.65}

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
