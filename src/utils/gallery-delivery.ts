/**
 * Public gallery image selection and multi-route delivery.
 * Native EdgeOne acceleration is primary; Cloudflare serves as secondary CDN / fallback.
 */
import thumbnailIndex from "@/data/gallery-thumbnails.json";

export type GalleryImageRoute = "auto" | "cloudflare" | "original";
export const GALLERY_ROUTE_STORAGE_KEY = "firefly.gallery.image-route.v1";
export const GALLERY_ROUTE_EVENT = "firefly:gallery-route-changed";
export const GALLERY_CF_ORIGIN = "https://img.casto.top";

const entries: Record<string, string> = (thumbnailIndex as { images?: Record<string, string> })?.images || {};

function extractFilePath(original: string): string {
	try {
		if (original.startsWith("/file/")) return original;
		const url = new URL(original, "https://blog.casto.top");
		if (url.pathname.startsWith("/file/")) return url.pathname;
		return "/file/" + url.pathname.replace(/^\/+/, "");
	} catch {
		return original.startsWith("/") ? "/file" + original : "/file/" + original;
	}
}

export function galleryThumbnail(original: string): string | null {
	return entries[original] || null;
}

export function cloudflareGalleryImage(original: string): string {
	const path = extractFilePath(original);
	return `${GALLERY_CF_ORIGIN}${path}`;
}

export function edgeoneGalleryImage(original: string): string {
	return extractFilePath(original);
}

export function galleryGridImage(original: string, route: GalleryImageRoute): string {
	if (route === "original") return extractFilePath(original);
	if (route === "cloudflare") return cloudflareGalleryImage(original);
	return galleryThumbnail(original) || edgeoneGalleryImage(original);
}

export function galleryFullImage(original: string, route: GalleryImageRoute): string {
	if (route === "cloudflare") return cloudflareGalleryImage(original);
	return edgeoneGalleryImage(original);
}

/** Fallback sequence: EdgeOne -> Cloudflare -> Direct */
export function nextGalleryImageFallback(
	current: string,
	original: string,
	_route: GalleryImageRoute,
): string | null {
	const cf = cloudflareGalleryImage(original);
	const eo = edgeoneGalleryImage(original);

	if (current.includes("img.casto.top")) {
		return eo !== current ? eo : null;
	}
	return cf !== current ? cf : null;
}

export function parseGalleryRoute(value: unknown): GalleryImageRoute {
	return value === "cloudflare" || value === "original" ? value : "auto";
}

export function loadGalleryRoute(): GalleryImageRoute {
	try {
		return parseGalleryRoute(localStorage.getItem(GALLERY_ROUTE_STORAGE_KEY));
	} catch {
		return "auto";
	}
}

export function saveGalleryRoute(next: GalleryImageRoute): void {
	try {
		localStorage.setItem(GALLERY_ROUTE_STORAGE_KEY, next);
	} catch {}
	if (typeof window !== "undefined") {
		window.dispatchEvent(new CustomEvent(GALLERY_ROUTE_EVENT, { detail: next }));
	}
}
